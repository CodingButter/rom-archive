// file_sink.hpp — the SD-write seam. The core writes each ROM through this
// interface; the platform layer backs it with libctru FS calls, tests back it
// with an in-memory fake. Like HttpClient, it only accepts chunks, so nothing
// is buffered whole above the OS write layer.
#pragma once

#include <cstddef>
#include <cstdint>
#include <string>

namespace rom_archive {

class FileSink {
 public:
  virtual ~FileSink() = default;

  // Begin writing a file at `targetPath` (relative to the SD root, e.g.
  // "roms/gba/game.gba"). Creates parent directories as needed. Returns false
  // on failure. Any previously-open file is closed/discarded first.
  virtual bool open(const std::string& targetPath) = 0;

  // Append bytes to the currently-open file. Returns false on write failure.
  virtual bool write(const std::uint8_t* data, std::size_t len) = 0;

  // Close the currently-open file, committing it. Returns false on failure.
  virtual bool close() = 0;

  // Remove a partially-written / failed file (called on verify mismatch or
  // transfer abort so corrupt ROMs never linger on the SD card).
  virtual void remove(const std::string& targetPath) = 0;

  // Human-readable reason for the most recent open/write/close failure (e.g.
  // "errno 28 (No space left)"). Empty when unknown. Backends may leave the
  // default; it only feeds on-device diagnostics.
  virtual std::string lastError() const { return {}; }
};

}  // namespace rom_archive
