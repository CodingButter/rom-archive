// zip_extract_3ds.cpp — see header. Reads the whole archive into a heap buffer
// (No-Intro per-game zips are KB..low-MB, comfortably within the 3DS heap),
// picks the largest entry as the ROM, extracts it to a heap buffer, and writes
// it beside the archive under roms/<console>/.
#include "platform/zip_extract_3ds.hpp"

#include <sys/stat.h>

#include <cerrno>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include "miniz.h"

namespace rom_archive {

namespace {

constexpr const char* kSdRoot = "sdmc:/";

std::string sdPath(const std::string& targetPath) { return kSdRoot + targetPath; }

std::string errnoText() {
  const int e = errno;
  return "errno " + std::to_string(e) + " (" + std::strerror(e) + ")";
}

// The SD-relative directory of a target path ("roms/snes/x.zip" -> "roms/snes/").
std::string dirOf(const std::string& path) {
  const std::size_t slash = path.find_last_of('/');
  if (slash == std::string::npos) return "";
  return path.substr(0, slash + 1);
}

// Read an entire file from the SD into a heap buffer.
bool readWhole(const std::string& fullPath, std::vector<std::uint8_t>& out,
               std::string& err) {
  errno = 0;
  std::FILE* f = std::fopen(fullPath.c_str(), "rb");
  if (!f) {
    err = "open zip: " + errnoText();
    return false;
  }
  std::fseek(f, 0, SEEK_END);
  const long size = std::ftell(f);
  std::fseek(f, 0, SEEK_SET);
  if (size <= 0) {
    std::fclose(f);
    err = "empty zip";
    return false;
  }
  out.resize(static_cast<std::size_t>(size));
  const std::size_t read = std::fread(out.data(), 1, out.size(), f);
  std::fclose(f);
  if (read != out.size()) {
    err = "short read on zip";
    return false;
  }
  return true;
}

// mkdir every parent directory of an SD-absolute path (idempotent).
void makeParentDirs(const std::string& fullPath) {
  std::size_t start = fullPath.find('/', std::string(kSdRoot).size() - 1);
  for (std::size_t slash = start; slash != std::string::npos;
       slash = fullPath.find('/', slash + 1)) {
    if (slash == 0) continue;
    const std::string dir = fullPath.substr(0, slash);
    if (dir.empty() || dir.back() == ':') continue;
    mkdir(dir.c_str(), 0777);
  }
}

// The basename of a zip entry, dropping any internal directory components so a
// nested "path/inside/rom.sfc" lands flat in roms/<console>/.
std::string entryBasename(const char* name) {
  std::string s(name ? name : "");
  const std::size_t slash = s.find_last_of("/\\");
  return slash == std::string::npos ? s : s.substr(slash + 1);
}

bool writeWhole(const std::string& fullPath, const void* data, std::size_t len,
                std::string& err) {
  makeParentDirs(fullPath);
  errno = 0;
  std::FILE* f = std::fopen(fullPath.c_str(), "wb");
  if (!f) {
    err = "open rom: " + errnoText();
    return false;
  }
  const std::size_t wrote = std::fwrite(data, 1, len, f);
  errno = 0;
  const bool closed = std::fclose(f) == 0;
  if (wrote != len || !closed) {
    err = "write rom: " + errnoText();
    return false;
  }
  return true;
}

}  // namespace

ZipExtractResult extractRomZip(const std::string& zipTargetPath) {
  ZipExtractResult r;
  const std::string zipFull = sdPath(zipTargetPath);

  std::vector<std::uint8_t> zipBytes;
  if (!readWhole(zipFull, zipBytes, r.error)) return r;

  mz_zip_archive zip;
  std::memset(&zip, 0, sizeof(zip));
  if (!mz_zip_reader_init_mem(&zip, zipBytes.data(), zipBytes.size(), 0)) {
    r.error = "not a valid zip";
    return r;
  }

  // Pick the largest regular file in the archive as the ROM. No-Intro zips hold
  // exactly one ROM, but scanning for the biggest entry ignores any stray
  // directory records or sidecar files without hard-coding an index.
  const mz_uint count = mz_zip_reader_get_num_files(&zip);
  int romIndex = -1;
  mz_uint64 romSize = 0;
  for (mz_uint i = 0; i < count; ++i) {
    mz_zip_archive_file_stat st;
    if (!mz_zip_reader_file_stat(&zip, i, &st)) continue;
    if (mz_zip_reader_is_file_a_directory(&zip, i)) continue;
    if (st.m_uncomp_size >= romSize) {
      romSize = st.m_uncomp_size;
      romIndex = static_cast<int>(i);
    }
  }

  if (romIndex < 0) {
    mz_zip_reader_end(&zip);
    r.error = "zip has no file entries";
    return r;
  }

  mz_zip_archive_file_stat st;
  mz_zip_reader_file_stat(&zip, static_cast<mz_uint>(romIndex), &st);
  const std::string romName = entryBasename(st.m_filename);
  if (romName.empty()) {
    mz_zip_reader_end(&zip);
    r.error = "zip entry has no name";
    return r;
  }

  std::size_t outLen = 0;
  void* out = mz_zip_reader_extract_to_heap(&zip, static_cast<mz_uint>(romIndex),
                                            &outLen, 0);
  mz_zip_reader_end(&zip);
  if (!out) {
    r.error = "inflate failed";
    return r;
  }

  const std::string romTarget = dirOf(zipTargetPath) + romName;
  const bool wrote = writeWhole(sdPath(romTarget), out, outLen, r.error);
  mz_free(out);
  if (!wrote) return r;

  // The archive has served its purpose; drop it so only the playable ROM
  // remains in roms/<console>/.
  std::remove(zipFull.c_str());

  r.ok = true;
  r.romPath = romTarget;
  return r;
}

}  // namespace rom_archive
