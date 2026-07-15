// contract.hpp — C++ mirror of the TypeScript wire contract
// (packages/contract). Hand-written to stay dependency-free and portable; kept
// honest by scripts/check_contract.mjs, which diffs the sentinel-delimited
// blocks below against the canonical artifacts emitted by the contract package
// (schema/console-dirs.json and schema/contract-fields.json). Editing a field
// name or console mapping here without matching the contract fails that check.
#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace rom_archive {

// The frozen v1 console set. The enumerators mirror the contract's Console
// union; the string dir mapping below is the load-bearing artifact.
enum class Console {
  Nds,
  Gba,
  Gb,
  Gbc,
  Snes,
  Nes,
  Gg,
  Sms,
  Md,
  Pce,
};

// Parse a console id (the wire string, e.g. "gba") into the enum. Returns
// nullopt for an unknown id.
std::optional<Console> consoleFromId(const std::string& id);

// The wire id string for a console (inverse of consoleFromId).
std::string consoleId(Console console);

// The SD ROM directory for a console, INCLUDING the leading "roms/" segment —
// matches the TypeScript consoleToRomsDir() exactly (e.g. Gba -> "roms/gba").
// The console->dir map is the single source of truth for path routing; the
// sentinel block below is diffed against schema/console-dirs.json.
std::string consoleToRomsDir(Console console);

// --- Contract-mirrored structs. Each field block is sentinel-delimited and
// diffed against schema/contract-fields.json (presence/naming, not C++ types;
// types are proven by the JSON-parse fixture tests). ---

struct CatalogEntry {
  // @contract:fields:CatalogEntry:begin
  std::optional<std::int64_t> approxSizeBytes;
  Console console;
  std::string id;
  std::string kind;  // "bundle" | "single"
  std::string title;
  // @contract:fields:CatalogEntry:end
};

struct ItemDetailFile {
  // @contract:fields:ItemDetailFile:begin
  std::string downloadUrl;
  std::string md5;
  std::string name;
  std::int64_t sizeBytes;
  // @contract:fields:ItemDetailFile:end
};

struct DownloadPlanRequest {
  // @contract:fields:DownloadPlanRequest:begin
  std::int64_t freeSpaceBytes;
  std::string id;
  std::optional<std::vector<std::string>> selectedFileNames;
  // @contract:fields:DownloadPlanRequest:end
};

struct PlanFile {
  std::string name;
  std::int64_t sizeBytes;
  std::string md5;
  std::string downloadUrl;
  std::string targetPath;
};

struct ExcludedFile {
  std::string name;
  std::int64_t sizeBytes;
  std::string reason;  // "not-selected" | "insufficient-space"
};

struct DownloadPlanResponse {
  // @contract:fields:DownloadPlanResponse:begin
  std::optional<std::vector<ExcludedFile>> excluded;
  std::vector<PlanFile> files;
  bool fits;
  std::int64_t freeSpaceBytes;
  std::int64_t totalBytes;
  // @contract:fields:DownloadPlanResponse:end
};

struct CatalogResponse {
  std::vector<CatalogEntry> entries;
};

struct ItemDetailResponse {
  std::string id;
  Console console;
  std::vector<ItemDetailFile> files;
};

}  // namespace rom_archive
