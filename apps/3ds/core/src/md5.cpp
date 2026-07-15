#include "rom_archive/md5.hpp"

#include <algorithm>
#include <cctype>
#include <cstring>

namespace rom_archive {

namespace {

inline std::uint32_t rotl(std::uint32_t x, int c) {
  return (x << c) | (x >> (32 - c));
}

// Per-round shift amounts (RFC 1321).
constexpr int S[64] = {
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9,  14, 20, 5, 9,  14, 20, 5, 9,  14, 20, 5, 9,  14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21};

// Precomputed table K[i] = floor(2^32 * abs(sin(i+1))) (RFC 1321).
constexpr std::uint32_t K[64] = {
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a,
    0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
    0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340,
    0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8,
    0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
    0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa,
    0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92,
    0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
    0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391};

}  // namespace

Md5::Md5() { reset(); }

void Md5::reset() {
  state_ = {0x67452301u, 0xefcdab89u, 0x98badcfeu, 0x10325476u};
  bitCount_ = 0;
  bufferLen_ = 0;
}

void Md5::processBlock(const std::uint8_t* block) {
  std::uint32_t M[16];
  for (int i = 0; i < 16; ++i) {
    M[i] = static_cast<std::uint32_t>(block[i * 4]) |
           (static_cast<std::uint32_t>(block[i * 4 + 1]) << 8) |
           (static_cast<std::uint32_t>(block[i * 4 + 2]) << 16) |
           (static_cast<std::uint32_t>(block[i * 4 + 3]) << 24);
  }

  std::uint32_t a = state_[0], b = state_[1], c = state_[2], d = state_[3];

  for (int i = 0; i < 64; ++i) {
    std::uint32_t f;
    int g;
    if (i < 16) {
      f = (b & c) | (~b & d);
      g = i;
    } else if (i < 32) {
      f = (d & b) | (~d & c);
      g = (5 * i + 1) % 16;
    } else if (i < 48) {
      f = b ^ c ^ d;
      g = (3 * i + 5) % 16;
    } else {
      f = c ^ (b | ~d);
      g = (7 * i) % 16;
    }
    const std::uint32_t tmp = d;
    d = c;
    c = b;
    b = b + rotl(a + f + K[i] + M[g], S[i]);
    a = tmp;
  }

  state_[0] += a;
  state_[1] += b;
  state_[2] += c;
  state_[3] += d;
}

void Md5::update(const std::uint8_t* data, std::size_t len) {
  bitCount_ += static_cast<std::uint64_t>(len) * 8;

  // Drain into any partially-filled buffer first.
  if (bufferLen_ > 0) {
    const std::size_t need = 64 - bufferLen_;
    const std::size_t take = std::min(need, len);
    std::memcpy(buffer_.data() + bufferLen_, data, take);
    bufferLen_ += take;
    data += take;
    len -= take;
    if (bufferLen_ == 64) {
      processBlock(buffer_.data());
      bufferLen_ = 0;
    }
  }

  // Process full 64-byte blocks straight from the input.
  while (len >= 64) {
    processBlock(data);
    data += 64;
    len -= 64;
  }

  // Stash the remainder.
  if (len > 0) {
    std::memcpy(buffer_.data() + bufferLen_, data, len);
    bufferLen_ += len;
  }
}

std::string Md5::finalHex() {
  const std::uint64_t totalBits = bitCount_;

  // Pad manually (not via update(), which would advance bitCount_): append
  // 0x80, then zeros until the buffer holds 56 bytes, flushing a full block if
  // the 0x80 pushed us past 56.
  buffer_[bufferLen_++] = 0x80;
  if (bufferLen_ > 56) {
    while (bufferLen_ < 64) buffer_[bufferLen_++] = 0x00;
    processBlock(buffer_.data());
    bufferLen_ = 0;
  }
  while (bufferLen_ < 56) buffer_[bufferLen_++] = 0x00;

  // Append the 64-bit little-endian message length in bits.
  for (int i = 0; i < 8; ++i) {
    buffer_[bufferLen_++] = static_cast<std::uint8_t>((totalBits >> (8 * i)) & 0xff);
  }
  processBlock(buffer_.data());
  bufferLen_ = 0;

  // Serialize the state little-endian to hex.
  static const char* hex = "0123456789abcdef";
  std::string out;
  out.reserve(32);
  for (int i = 0; i < 4; ++i) {
    for (int j = 0; j < 4; ++j) {
      const std::uint8_t byte =
          static_cast<std::uint8_t>((state_[i] >> (8 * j)) & 0xff);
      out += hex[byte >> 4];
      out += hex[byte & 0x0f];
    }
  }
  return out;
}

std::string md5Hex(const std::uint8_t* data, std::size_t len) {
  Md5 h;
  h.update(data, len);
  return h.finalHex();
}

bool verifyHex(const std::string& expectedHex, const std::string& computedHex) {
  if (expectedHex.size() != computedHex.size()) return false;
  for (std::size_t i = 0; i < expectedHex.size(); ++i) {
    if (std::tolower(static_cast<unsigned char>(expectedHex[i])) !=
        std::tolower(static_cast<unsigned char>(computedHex[i]))) {
      return false;
    }
  }
  return true;
}

}  // namespace rom_archive
