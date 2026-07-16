// json_nlohmann.cpp — host implementation of the json.hpp seam using
// nlohmann/json. The on-device build substitutes a jansson-backed
// implementation of the same signatures (not compiled here).
#include "rom_archive/json.hpp"

#include <cstdint>
#include <stdexcept>
#include <utility>
#include <vector>

#include "json.hpp"  // vendored nlohmann/json single header

namespace rom_archive {

namespace {

using nlohmann::json;

// Read a required string field; throws (caught by the caller) if absent/wrong.
std::string reqStr(const json& j, const char* key) {
  return j.at(key).get<std::string>();
}

std::int64_t reqInt(const json& j, const char* key) {
  return j.at(key).get<std::int64_t>();
}

Console reqConsole(const json& j, const char* key) {
  const auto id = j.at(key).get<std::string>();
  const auto console = consoleFromId(id);
  if (!console) throw std::runtime_error("unknown console id");
  return *console;
}

ItemDetailFile parseItemFile(const json& j) {
  ItemDetailFile f;
  f.name = reqStr(j, "name");
  f.sizeBytes = reqInt(j, "sizeBytes");
  f.md5 = reqStr(j, "md5");
  f.downloadUrl = reqStr(j, "downloadUrl");
  return f;
}

PlanFile parsePlanFile(const json& j) {
  PlanFile f;
  f.name = reqStr(j, "name");
  f.sizeBytes = reqInt(j, "sizeBytes");
  f.md5 = reqStr(j, "md5");
  f.downloadUrl = reqStr(j, "downloadUrl");
  f.targetPath = reqStr(j, "targetPath");
  return f;
}

ExcludedFile parseExcluded(const json& j) {
  ExcludedFile e;
  e.name = reqStr(j, "name");
  e.sizeBytes = reqInt(j, "sizeBytes");
  e.reason = reqStr(j, "reason");
  return e;
}

ResolvedFile parseResolvedFile(const json& j) {
  ResolvedFile f;
  f.name = reqStr(j, "name");
  f.sizeBytes = reqInt(j, "sizeBytes");
  f.md5 = reqStr(j, "md5");
  f.downloadUrl = reqStr(j, "downloadUrl");
  f.targetPath = reqStr(j, "targetPath");
  if (j.contains("coverUrl") && !j.at("coverUrl").is_null()) {
    f.coverUrl = j.at("coverUrl").get<std::string>();
  }
  if (j.contains("coverTargetPath") && !j.at("coverTargetPath").is_null()) {
    f.coverTargetPath = j.at("coverTargetPath").get<std::string>();
  }
  return f;
}

CatalogEntry parseCatalogEntry(const json& j) {
  CatalogEntry e;
  e.id = reqStr(j, "id");
  e.title = reqStr(j, "title");
  e.console = reqConsole(j, "console");
  e.kind = reqStr(j, "kind");
  if (j.contains("approxSizeBytes") && !j.at("approxSizeBytes").is_null()) {
    e.approxSizeBytes = j.at("approxSizeBytes").get<std::int64_t>();
  }
  return e;
}

}  // namespace

std::optional<CatalogResponse> parseCatalogResponse(const std::string& text) {
  try {
    const json j = json::parse(text);
    CatalogResponse out;
    for (const auto& e : j.at("entries")) out.entries.push_back(parseCatalogEntry(e));
    return out;
  } catch (const std::exception&) {
    return std::nullopt;
  }
}

std::optional<ItemDetailResponse> parseItemDetailResponse(const std::string& text) {
  try {
    const json j = json::parse(text);
    ItemDetailResponse out;
    out.id = reqStr(j, "id");
    out.console = reqConsole(j, "console");
    for (const auto& f : j.at("files")) out.files.push_back(parseItemFile(f));
    return out;
  } catch (const std::exception&) {
    return std::nullopt;
  }
}

std::optional<DownloadPlanResponse> parseDownloadPlanResponse(const std::string& text) {
  try {
    const json j = json::parse(text);
    DownloadPlanResponse out;
    out.fits = j.at("fits").get<bool>();
    out.totalBytes = reqInt(j, "totalBytes");
    out.freeSpaceBytes = reqInt(j, "freeSpaceBytes");
    for (const auto& f : j.at("files")) out.files.push_back(parsePlanFile(f));
    if (j.contains("excluded") && !j.at("excluded").is_null()) {
      std::vector<ExcludedFile> excluded;
      for (const auto& e : j.at("excluded")) excluded.push_back(parseExcluded(e));
      out.excluded = std::move(excluded);
    }
    return out;
  } catch (const std::exception&) {
    return std::nullopt;
  }
}

std::optional<ScanPointer> parseScanPointer(const std::string& text) {
  try {
    const json j = json::parse(text);
    if (!j.is_object()) return std::nullopt;
    if (!j.contains("v") || !j.at("v").is_number_integer()) return std::nullopt;
    if (j.at("v").get<int>() != 1) return std::nullopt;
    if (!j.contains("id") || !j.at("id").is_string()) return std::nullopt;
    ScanPointer p;
    p.v = 1;
    p.id = j.at("id").get<std::string>();
    if (p.id.empty()) return std::nullopt;
    if (j.contains("file") && !j.at("file").is_null()) {
      if (!j.at("file").is_string()) return std::nullopt;
      const auto file = j.at("file").get<std::string>();
      if (file.empty()) return std::nullopt;
      p.file = file;
    }
    return p;
  } catch (const std::exception&) {
    return std::nullopt;
  }
}

std::optional<ResolveResponse> parseResolveResponse(const std::string& text) {
  try {
    const json j = json::parse(text);
    ResolveResponse out;
    out.id = reqStr(j, "id");
    out.console = reqConsole(j, "console");
    out.totalBytes = reqInt(j, "totalBytes");
    for (const auto& f : j.at("files")) out.files.push_back(parseResolvedFile(f));
    return out;
  } catch (const std::exception&) {
    return std::nullopt;
  }
}

std::string serializeDownloadPlanRequest(const DownloadPlanRequest& req) {
  json j;
  j["id"] = req.id;
  j["freeSpaceBytes"] = req.freeSpaceBytes;
  if (req.selectedFileNames) j["selectedFileNames"] = *req.selectedFileNames;
  return j.dump();
}

std::string serializeScanPointer(const ScanPointer& pointer) {
  // Emit canonical key order v -> id -> file explicitly (nlohmann's object dump
  // sorts keys alphabetically, which would reorder them). Values are escaped via
  // json(...).dump() so filenames with quotes/backslashes stay valid JSON.
  std::string out = "{\"v\":1,\"id\":";
  out += json(pointer.id).dump();
  if (pointer.file) {
    out += ",\"file\":";
    out += json(*pointer.file).dump();
  }
  out += "}";
  return out;
}

}  // namespace rom_archive
