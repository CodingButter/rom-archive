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

// Serialize a plan request to JSON for the POST body.
std::string serializeDownloadPlanRequest(const DownloadPlanRequest& req);

}  // namespace rom_archive
