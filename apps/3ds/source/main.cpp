// Phase-6a minimal app. Boots libctru, prints a placeholder screen, and — the
// point of this phase — calls into the Phase-5 console-agnostic core
// (consoleToRomsDir) to prove the core cross-compiles and links under
// devkitARM, not just under the host toolchain. Phase 6b replaces this with the
// real UI + platform layer.
#include <3ds.h>
#include <cstdio>

#include "rom_archive/contract.hpp"

int main(int argc, char** argv) {
  (void)argc;
  (void)argv;

  gfxInitDefault();
  consoleInit(GFX_TOP, nullptr);

  std::printf("ROM Archive\n");
  std::printf("API: %s\n\n", API_BASE_URL);

  // Prove the core links: route a couple of consoles through the shared logic.
  std::printf("routing sample (from shared core):\n");
  std::printf("  gba  -> %s\n", rom_archive::consoleToRomsDir(rom_archive::Console::Gba).c_str());
  std::printf("  nds  -> %s\n", rom_archive::consoleToRomsDir(rom_archive::Console::Nds).c_str());
  std::printf("  md   -> %s\n", rom_archive::consoleToRomsDir(rom_archive::Console::Md).c_str());
  std::printf("\nPress START to exit.\n");

  while (aptMainLoop()) {
    hidScanInput();
    if (hidKeysDown() & KEY_START) break;
    gfxFlushBuffers();
    gfxSwapBuffers();
    gspWaitForVBlank();
  }

  gfxExit();
  return 0;
}
