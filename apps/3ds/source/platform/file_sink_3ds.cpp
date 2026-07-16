// file_sink_3ds.cpp — see header. Paths from the core are SD-relative
// ("roms/gba/game.gba"); this backend prefixes the devkitPro SD mount point
// ("sdmc:/") and mkdir's each parent segment before creating the file.
#include "platform/file_sink_3ds.hpp"

#include <3ds.h>
#include <sys/stat.h>

#include <cerrno>
#include <cstdint>
#include <cstring>
#include <string>

namespace rom_archive {

namespace {

constexpr const char* kSdRoot = "sdmc:/";

std::string sdPath(const std::string& targetPath) { return kSdRoot + targetPath; }

std::string errnoText() {
  const int e = errno;
  return "errno " + std::to_string(e) + " (" + std::strerror(e) + ")";
}

// mkdir every parent directory of an SD-absolute path (idempotent).
void makeParentDirs(const std::string& fullPath) {
  // Start after the "sdmc:/" prefix so we never try to mkdir the mount itself.
  std::size_t start = fullPath.find('/', std::string(kSdRoot).size() - 1);
  for (std::size_t slash = start; slash != std::string::npos;
       slash = fullPath.find('/', slash + 1)) {
    if (slash == 0) continue;
    const std::string dir = fullPath.substr(0, slash);
    if (dir.empty() || dir.back() == ':') continue;
    mkdir(dir.c_str(), 0777);  // EEXIST is fine
  }
}

}  // namespace

FileSink3ds::~FileSink3ds() {
  if (file_) std::fclose(file_);
}

bool FileSink3ds::open(const std::string& targetPath) {
  if (file_) {
    std::fclose(file_);
    file_ = nullptr;
  }
  const std::string full = sdPath(targetPath);
  makeParentDirs(full);
  errno = 0;
  file_ = std::fopen(full.c_str(), "wb");
  if (!file_) lastError_ = errnoText();
  return file_ != nullptr;
}

bool FileSink3ds::write(const std::uint8_t* data, std::size_t len) {
  if (!file_) {
    lastError_ = "no open file";
    return false;
  }
  errno = 0;
  if (std::fwrite(data, 1, len, file_) == len) return true;
  lastError_ = errnoText();
  return false;
}

bool FileSink3ds::close() {
  if (!file_) {
    lastError_ = "no open file";
    return false;
  }
  errno = 0;
  const bool ok = std::fclose(file_) == 0;
  if (!ok) lastError_ = errnoText();
  file_ = nullptr;
  return ok;
}

void FileSink3ds::remove(const std::string& targetPath) {
  if (file_) {
    std::fclose(file_);
    file_ = nullptr;
  }
  std::remove(sdPath(targetPath).c_str());
}

std::int64_t sdFreeBytes() {
  FS_ArchiveResource resource = {0, 0, 0, 0};
  if (R_FAILED(FSUSER_GetSdmcArchiveResource(&resource))) return -1;
  const std::uint64_t bytes = static_cast<std::uint64_t>(resource.freeClusters) *
                              resource.clusterSize;
  return static_cast<std::int64_t>(bytes);
}

}  // namespace rom_archive
