#include "rom_archive/contract.hpp"

#include <array>
#include <utility>

namespace rom_archive {

namespace {

// The console -> (id, dir) table. The dir column is the load-bearing routing
// map; the sentinel block is diffed against schema/console-dirs.json by
// scripts/check_contract.mjs. One { Console, "dir" } entry per line, in the
// exact form the checker's regex expects.
struct ConsoleRow {
  Console console;
  const char* id;
  const char* dir;
};

constexpr std::array<ConsoleRow, 10> kConsoleRows = {{
    // @contract:console-dirs:begin
    {Console::Gb, "gb", "gb"},
    {Console::Gba, "gba", "gba"},
    {Console::Gbc, "gbc", "gbc"},
    {Console::Gg, "gg", "gg"},
    {Console::Md, "md", "gen"},
    {Console::Nds, "nds", "nds"},
    {Console::Nes, "nes", "nes"},
    {Console::Pce, "pce", "tg16"},
    {Console::Sms, "sms", "sms"},
    {Console::Snes, "snes", "snes"},
    // @contract:console-dirs:end
}};

}  // namespace

std::optional<Console> consoleFromId(const std::string& id) {
  for (const auto& row : kConsoleRows) {
    if (id == row.id) return row.console;
  }
  return std::nullopt;
}

std::string consoleId(Console console) {
  for (const auto& row : kConsoleRows) {
    if (row.console == console) return row.id;
  }
  return {};
}

std::string consoleToRomsDir(Console console) {
  for (const auto& row : kConsoleRows) {
    if (row.console == console) return std::string("roms/") + row.dir;
  }
  return {};
}

}  // namespace rom_archive
