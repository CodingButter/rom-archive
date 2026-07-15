// md5.hpp — a hand-written, incremental MD5 (RFC 1321). Incremental so the
// platform layer can hash ROM bytes as they stream to the SD card without ever
// buffering the whole file. This is deliberately implemented from scratch
// rather than vendored: the streaming update()/final() API is the point.
#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string>

namespace rom_archive {

class Md5 {
 public:
  Md5();

  // Feed more bytes. May be called any number of times with any chunk sizes;
  // the resulting digest is identical to hashing the concatenation in one call.
  void update(const std::uint8_t* data, std::size_t len);

  // Finalize and return the 32-char lowercase hex digest. After calling this,
  // the object must be reset() before reuse.
  std::string finalHex();

  // Reset to the initial state so the object can hash a new stream.
  void reset();

 private:
  void processBlock(const std::uint8_t* block);

  std::array<std::uint32_t, 4> state_;
  std::uint64_t bitCount_;
  std::array<std::uint8_t, 64> buffer_;
  std::size_t bufferLen_;
};

// Convenience: one-shot hash of a byte range.
std::string md5Hex(const std::uint8_t* data, std::size_t len);

// Case-insensitive hex-digest comparison (archive.org md5s are lowercase, but
// be defensive).
bool verifyHex(const std::string& expectedHex, const std::string& computedHex);

}  // namespace rom_archive
