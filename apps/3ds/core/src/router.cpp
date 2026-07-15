#include "rom_archive/router.hpp"

#include <algorithm>
#include <cctype>
#include <cstddef>
#include <string>
#include <unordered_set>

namespace rom_archive {

namespace {

constexpr std::size_t kMaxFatName = 128;

bool isIllegalFat(unsigned char c) {
  switch (c) {
    case '"':
    case '*':
    case '/':
    case ':':
    case '<':
    case '>':
    case '?':
    case '\\':
    case '|':
      return true;
    default:
      return false;
  }
}

std::string toLower(const std::string& s) {
  std::string out = s;
  std::transform(out.begin(), out.end(), out.begin(),
                 [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  return out;
}

}  // namespace

std::string sanitizeFatName(const std::string& name) {
  std::string out;
  out.reserve(name.size());
  // Byte-wise: control chars (< 0x20) and the illegal set become '_'. Bytes
  // >= 0x80 (UTF-8 continuation/lead) are passed through unchanged, matching
  // the TS which keeps any non-illegal code point.
  for (unsigned char c : name) {
    if (c < 0x20 || isIllegalFat(c)) {
      out += '_';
    } else {
      out += static_cast<char>(c);
    }
  }

  // Trim trailing dots and spaces (illegal as the final char on FAT/Windows).
  std::size_t end = out.size();
  while (end > 0 && (out[end - 1] == '.' || out[end - 1] == ' ')) --end;
  out.resize(end);

  // Cap length, preserving a short extension when there is one.
  if (out.size() > kMaxFatName) {
    const std::size_t dot = out.rfind('.');
    if (dot != std::string::npos && dot > 0 && out.size() - dot <= 8) {
      const std::string ext = out.substr(dot);
      out = out.substr(0, kMaxFatName - ext.size()) + ext;
    } else {
      out = out.substr(0, kMaxFatName);
    }
  }

  return out.empty() ? std::string("_") : out;
}

std::vector<std::string> sanitizeForPlan(const std::vector<std::string>& names) {
  std::unordered_set<std::string> used;
  std::vector<std::string> result;
  result.reserve(names.size());

  for (const auto& name : names) {
    const std::string base = sanitizeFatName(name);
    std::string candidate = base;
    int n = 1;
    while (used.count(toLower(candidate)) != 0) {
      const std::size_t dot = base.rfind('.');
      if (dot != std::string::npos && dot > 0) {
        candidate = base.substr(0, dot) + "~" + std::to_string(n) + base.substr(dot);
      } else {
        candidate = base + "~" + std::to_string(n);
      }
      ++n;
    }
    used.insert(toLower(candidate));
    result.push_back(candidate);
  }

  return result;
}

std::string targetPathFor(Console console, const std::string& sanitizedName) {
  return consoleToRomsDir(console) + "/" + sanitizedName;
}

}  // namespace rom_archive
