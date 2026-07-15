// file_sink_3ds.hpp — FileSink backed by the SD card via newlib stdio (devkitPro
// mounts the SD at "sdmc:/"). Creates the roms/<console>/ parent directories on
// open and writes streamed chunks straight to disk, so nothing above the OS
// write layer is buffered whole.
#pragma once

#include <cstdio>
#include <string>

#include "rom_archive/file_sink.hpp"

namespace rom_archive {

class FileSink3ds final : public FileSink {
 public:
  ~FileSink3ds() override;

  bool open(const std::string& targetPath) override;
  bool write(const std::uint8_t* data, std::size_t len) override;
  bool close() override;
  void remove(const std::string& targetPath) override;

 private:
  std::FILE* file_ = nullptr;
};

// Free bytes available on the SD card, for the plan request's freeSpaceBytes.
// Returns -1 if the query fails.
std::int64_t sdFreeBytes();

}  // namespace rom_archive
