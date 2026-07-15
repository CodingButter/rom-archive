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

std::string serializeDownloadPlanRequest(const DownloadPlanRequest& req) {
  json j;
  j["id"] = req.id;
  j["freeSpaceBytes"] = req.freeSpaceBytes;
  if (req.selectedFileNames) j["selectedFileNames"] = *req.selectedFileNames;
  return j.dump();
}

}  // namespace rom_archive
