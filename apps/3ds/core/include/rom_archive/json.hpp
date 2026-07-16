// json.hpp — the JSON parse seam. The core parses catalog / item / plan
// responses into the contract structs through these free functions. The host
// build backs them with nlohmann/json; the on-device platform build can back
// the same signatures with 3ds-jansson. Callers include only this header, never
// a concrete JSON library.
#pragma once

#include <optional>
#include <string>

#include "rom_archive/contract.hpp"

namespace rom_archive {

// Each returns nullopt if the JSON is malformed or does not match the expected
// shape (e.g. an unknown console id, a missing required field).
std::optional<CatalogResponse> parseCatalogResponse(const std::string& json);
std::optional<ItemDetailResponse> parseItemDetailResponse(const std::string& json);
std::optional<DownloadPlanResponse> parseDownloadPlanResponse(const std::string& json);

// Parse a decoded QR string into a ScanPointer. Returns nullopt unless the JSON
// is an object with v==1 and a non-empty string id; `file`, if present, must be
// a non-empty string. Unknown extra keys are ignored.
std::optional<ScanPointer> parseScanPointer(const std::string& json);

// Parse an /api/resolve response into a ResolveResponse (nullopt on unknown
// console id or any missing required field).
std::optional<ResolveResponse> parseResolveResponse(const std::string& json);

// Serialize a plan request to JSON for the POST body.
std::string serializeDownloadPlanRequest(const DownloadPlanRequest& req);

// Serialize a ScanPointer to the canonical {"v":1,"id":...[,"file":...]} JSON
// for the POST body to /api/resolve (POST avoids URL-encoding ROM filenames).
std::string serializeScanPointer(const ScanPointer& pointer);

}  // namespace rom_archive
