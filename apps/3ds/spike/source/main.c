// Phase-0 CIA-toolchain spike: the smallest libctru app that proves the full
// packaging path (.elf -> .3dsx -> .cia). It boots, clears a console screen,
// prints a line, and waits for START. No app logic lives here — this exists
// only to exercise devkitARM + makerom end to end. Phase 6a replaces it with
// the real minimal app that links the Phase-5 core.
#include <3ds.h>
#include <stdio.h>

int main(int argc, char **argv) {
	gfxInitDefault();
	consoleInit(GFX_TOP, NULL);

	printf("rom-archive CIA toolchain spike\n");
	printf("Press START to exit.\n");

	while (aptMainLoop()) {
		hidScanInput();
		if (hidKeysDown() & KEY_START) {
			break;
		}
		gfxFlushBuffers();
		gfxSwapBuffers();
		gspWaitForVBlank();
	}

	gfxExit();
	return 0;
}
