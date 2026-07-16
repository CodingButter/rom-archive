// json_jansson.cpp — on-device implementation of the json.hpp seam using
// 3ds-jansson (the same JSON library FBI uses). Mirrors the host
// nlohmann-backed json_nlohmann.cpp exactly in behaviour, but is written
// without C++ exceptions because the device build compiles -fno-exceptions:
// every "field missing / wrong type" path returns nullopt instead of throwing.
#include "rom_archive/json.hpp"

#include <cstdint>
#include <utility>
#include <vector>

#include <jansson.h>

namespace rom_archive {

namespace {

// RAII wrapper so a parsed json_t is always decref'd on every return path.
struct JsonRef {
  json_t* j = nullptr;
  explicit JsonRef(json_t* p) : j(p) {}
  ~JsonRef() {
    if (j) json_decref(j);
  }
  JsonRef(const JsonRef&) = delete;
  JsonRef& operator=(const JsonRef&) = delete;
};

// Field readers. `ok` is set to false (never back to true) on any failure so a
// caller can accumulate several reads and check once.
std::string reqStr(json_t* obj, const char* key, bool& ok) {
  json_t* v = json_object_get(obj, key);
  if (!v || !json_is_string(v)) {
    ok = false;
    return {};
  }
  return std::string(json_string_value(v));
}

std::int64_t reqInt(json_t* obj, const char* key, bool& ok) {
  json_t* v = json_object_get(obj, key);
  if (!v || !json_is_integer(v)) {
    ok = false;
    return 0;
  }
  return static_cast<std::int64_t>(json_integer_value(v));
}

bool reqBool(json_t* obj, const char* key, bool& ok) {
  json_t* v = json_object_get(obj, key);
  if (!v || !json_is_boolean(v)) {
    ok = false;
    return false;
  }
  return json_is_true(v);
}

Console reqConsole(json_t* obj, const char* key, bool& ok) {
  const std::string id = reqStr(obj, key, ok);
  if (!ok) return Console::Nds;
  const auto console = consoleFromId(id);
  if (!console) {
    ok = false;
    return Console::Nds;
  }
  return *console;
}

ItemDetailFile parseItemFile(json_t* j, bool& ok) {
  ItemDetailFile f;
  f.name = reqStr(j, "name", ok);
  f.sizeBytes = reqInt(j, "sizeBytes", ok);
  f.md5 = reqStr(j, "md5", ok);
  f.downloadUrl = reqStr(j, "downloadUrl", ok);
  return f;
}

PlanFile parsePlanFile(json_t* j, bool& ok) {
  PlanFile f;
  f.name = reqStr(j, "name", ok);
  f.sizeBytes = reqInt(j, "sizeBytes", ok);
  f.md5 = reqStr(j, "md5", ok);
  f.downloadUrl = reqStr(j, "downloadUrl", ok);
  f.targetPath = reqStr(j, "targetPath", ok);
  return f;
}

ExcludedFile parseExcluded(json_t* j, bool& ok) {
  ExcludedFile e;
  e.name = reqStr(j, "name", ok);
  e.sizeBytes = reqInt(j, "sizeBytes", ok);
  e.reason = reqStr(j, "reason", ok);
  return e;
}

// Read an optional string field: absent/null -> leave unset; present but
// non-string -> mark not-ok. Never sets ok back to true.
std::optional<std::string> optStr(json_t* obj, const char* key, bool& ok) {
  json_t* v = json_object_get(obj, key);
  if (!v || json_is_null(v)) return std::nullopt;
  if (!json_is_string(v)) {
    ok = false;
    return std::nullopt;
  }
  return std::string(json_string_value(v));
}

ResolvedFile parseResolvedFile(json_t* j, bool& ok) {
  ResolvedFile f;
  f.name = reqStr(j, "name", ok);
  f.sizeBytes = reqInt(j, "sizeBytes", ok);
  f.md5 = reqStr(j, "md5", ok);
  f.downloadUrl = reqStr(j, "downloadUrl", ok);
  f.targetPath = reqStr(j, "targetPath", ok);
  f.coverUrl = optStr(j, "coverUrl", ok);
  f.coverTargetPath = optStr(j, "coverTargetPath", ok);
  return f;
}

CatalogEntry parseCatalogEntry(json_t* j, bool& ok) {
  CatalogEntry e;
  e.id = reqStr(j, "id", ok);
  e.title = reqStr(j, "title", ok);
  e.console = reqConsole(j, "console", ok);
  e.kind = reqStr(j, "kind", ok);
  json_t* approx = json_object_get(j, "approxSizeBytes");
  if (approx && json_is_integer(approx)) {
    e.approxSizeBytes = static_cast<std::int64_t>(json_integer_value(approx));
  }
  return e;
}

}  // namespace

std::optional<CatalogResponse> parseCatalogResponse(const std::string& text) {
  json_error_t err;
  JsonRef root(json_loads(text.c_str(), 0, &err));
  if (!root.j || !json_is_object(root.j)) return std::nullopt;

  json_t* entries = json_object_get(root.j, "entries");
  if (!entries || !json_is_array(entries)) return std::nullopt;

  bool ok = true;
  CatalogResponse out;
  size_t i;
  json_t* e;
  json_array_foreach(entries, i, e) {
    if (!json_is_object(e)) return std::nullopt;
    out.entries.push_back(parseCatalogEntry(e, ok));
  }
  if (!ok) return std::nullopt;
  return out;
}

std::optional<ItemDetailResponse> parseItemDetailResponse(const std::string& text) {
  json_error_t err;
  JsonRef root(json_loads(text.c_str(), 0, &err));
  if (!root.j || !json_is_object(root.j)) return std::nullopt;

  bool ok = true;
  ItemDetailResponse out;
  out.id = reqStr(root.j, "id", ok);
  out.console = reqConsole(root.j, "console", ok);

  json_t* files = json_object_get(root.j, "files");
  if (!files || !json_is_array(files)) return std::nullopt;
  size_t i;
  json_t* f;
  json_array_foreach(files, i, f) {
    if (!json_is_object(f)) return std::nullopt;
    out.files.push_back(parseItemFile(f, ok));
  }
  // Paging metadata is optional: present on a paginated (page/pageSize) request,
  // absent on an id-only full-list request. Left at 0 when absent.
  if (json_t* t = json_object_get(root.j, "total"); t && json_is_integer(t))
    out.total = static_cast<std::int64_t>(json_integer_value(t));
  if (json_t* p = json_object_get(root.j, "page"); p && json_is_integer(p))
    out.page = static_cast<std::int64_t>(json_integer_value(p));
  if (json_t* ps = json_object_get(root.j, "pageSize"); ps && json_is_integer(ps))
    out.pageSize = static_cast<std::int64_t>(json_integer_value(ps));
  if (!ok) return std::nullopt;
  return out;
}

std::optional<DownloadPlanResponse> parseDownloadPlanResponse(const std::string& text) {
  json_error_t err;
  JsonRef root(json_loads(text.c_str(), 0, &err));
  if (!root.j || !json_is_object(root.j)) return std::nullopt;

  bool ok = true;
  DownloadPlanResponse out;
  out.fits = reqBool(root.j, "fits", ok);
  out.totalBytes = reqInt(root.j, "totalBytes", ok);
  out.freeSpaceBytes = reqInt(root.j, "freeSpaceBytes", ok);

  json_t* files = json_object_get(root.j, "files");
  if (!files || !json_is_array(files)) return std::nullopt;
  size_t i;
  json_t* f;
  json_array_foreach(files, i, f) {
    if (!json_is_object(f)) return std::nullopt;
    out.files.push_back(parsePlanFile(f, ok));
  }

  json_t* excluded = json_object_get(root.j, "excluded");
  if (excluded && json_is_array(excluded)) {
    std::vector<ExcludedFile> ex;
    size_t k;
    json_t* e;
    json_array_foreach(excluded, k, e) {
      if (!json_is_object(e)) return std::nullopt;
      ex.push_back(parseExcluded(e, ok));
    }
    out.excluded = std::move(ex);
  }

  if (!ok) return std::nullopt;
  return out;
}

std::optional<ScanPointer> parseScanPointer(const std::string& text) {
  json_error_t err;
  JsonRef root(json_loads(text.c_str(), 0, &err));
  if (!root.j || !json_is_object(root.j)) return std::nullopt;

  json_t* v = json_object_get(root.j, "v");
  if (!v || !json_is_integer(v) || json_integer_value(v) != 1) return std::nullopt;

  json_t* id = json_object_get(root.j, "id");
  if (!id || !json_is_string(id)) return std::nullopt;

  ScanPointer p;
  p.v = 1;
  p.id = std::string(json_string_value(id));
  if (p.id.empty()) return std::nullopt;

  json_t* file = json_object_get(root.j, "file");
  if (file && !json_is_null(file)) {
    if (!json_is_string(file)) return std::nullopt;
    std::string f(json_string_value(file));
    if (f.empty()) return std::nullopt;
    p.file = std::move(f);
  }
  return p;
}

std::optional<ResolveResponse> parseResolveResponse(const std::string& text) {
  json_error_t err;
  JsonRef root(json_loads(text.c_str(), 0, &err));
  if (!root.j || !json_is_object(root.j)) return std::nullopt;

  bool ok = true;
  ResolveResponse out;
  out.id = reqStr(root.j, "id", ok);
  out.console = reqConsole(root.j, "console", ok);
  out.totalBytes = reqInt(root.j, "totalBytes", ok);

  json_t* files = json_object_get(root.j, "files");
  if (!files || !json_is_array(files)) return std::nullopt;
  size_t i;
  json_t* f;
  json_array_foreach(files, i, f) {
    if (!json_is_object(f)) return std::nullopt;
    out.files.push_back(parseResolvedFile(f, ok));
  }
  if (!ok) return std::nullopt;
  return out;
}

std::string serializeDownloadPlanRequest(const DownloadPlanRequest& req) {
  JsonRef root(json_object());
  json_object_set_new(root.j, "id", json_string(req.id.c_str()));
  json_object_set_new(root.j, "freeSpaceBytes", json_integer(req.freeSpaceBytes));
  if (req.selectedFileNames) {
    json_t* arr = json_array();
    for (const auto& name : *req.selectedFileNames) {
      json_array_append_new(arr, json_string(name.c_str()));
    }
    json_object_set_new(root.j, "selectedFileNames", arr);
  }
  char* s = json_dumps(root.j, JSON_COMPACT);
  std::string out = s ? s : "{}";
  if (s) free(s);
  return out;
}

namespace {
// JSON-escape a single string value (including surrounding quotes) via jansson,
// so serializeScanPointer emits the same bytes as the host nlohmann backend.
std::string jsonString(const std::string& value) {
  JsonRef node(json_string(value.c_str()));
  char* s = node.j ? json_dumps(node.j, JSON_ENCODE_ANY | JSON_COMPACT) : nullptr;
  std::string out = s ? s : "\"\"";
  if (s) free(s);
  return out;
}
}  // namespace

std::string serializeScanPointer(const ScanPointer& pointer) {
  // Canonical key order v -> id -> file, byte-identical to json_nlohmann.cpp.
  std::string out = "{\"v\":1,\"id\":";
  out += jsonString(pointer.id);
  if (pointer.file) {
    out += ",\"file\":";
    out += jsonString(*pointer.file);
  }
  out += "}";
  return out;
}

}  // namespace rom_archive
