// router.hpp — FAT32-safe filename sanitization and SD path routing. Mirrors the
// TypeScript apps/api/src/sanitize.ts exactly (both are host-tested) so the name
// a ROM lands under on the SD card is decided identically on server and device.
#pragma once

#include <string>
#include <vector>

#include "rom_archive/contract.hpp"

namespace rom_archive {

// Turn an arbitrary archive.org filename into a FAT32-safe name: replace illegal
// characters (" * / : < > ? \ |) and control chars (< 0x20) with '_', trim
// trailing dots and spaces, and cap the length (preserving a short extension).
// Never returns empty ("_" if everything was stripped). Does NOT disambiguate
// collisions — that is sanitizeForPlan's job.
std::string sanitizeFatName(const std::string& name);

// Sanitize a batch of names for one plan, disambiguating collisions: if two
// inputs sanitize to the same name (case-insensitively), later ones get a
// "~1", "~2", … suffix inserted before the extension. Returns names in input
// order.
std::vector<std::string> sanitizeForPlan(const std::vector<std::string>& names);

// The SD target path for an already-sanitized file name on a console, e.g.
// "roms/gba/game.gba".
std::string targetPathFor(Console console, const std::string& sanitizedName);

}  // namespace rom_archive
