// zip_extract_3ds.hpp — extract a single-entry ZIP already written to the SD
// into its raw ROM alongside it, then delete the archive. archive.org serves
// the No-Intro sets as one .zip per game, but TWiLight Menu++ cannot read
// archives — it needs the extracted .sfc/.smc/etc. The download orchestrator
// verifies and writes the .zip (its catalog MD5 is the zip's hash); this step
// runs afterwards, on device only, to turn that verified zip into a playable
// ROM file in the same roms/<console>/ directory.
#pragma once

#include <string>

namespace rom_archive {

struct ZipExtractResult {
  bool ok = false;
  std::string romPath;  // SD-relative path of the extracted ROM, on success
  std::string error;    // human-readable failure detail, on failure
};

// `zipTargetPath` is SD-relative (e.g. "roms/snes/Game (USA).zip"). Reads the
// archive from the SD, extracts its largest file entry (the ROM) into the same
// directory using the entry's own name, and removes the .zip on success. The
// archive is left in place if extraction fails, so nothing is lost.
ZipExtractResult extractRomZip(const std::string& zipTargetPath);

}  // namespace rom_archive
