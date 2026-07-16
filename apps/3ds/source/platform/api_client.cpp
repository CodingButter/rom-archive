// api_client.cpp — see header. Each call builds the endpoint URL, performs the
// request through Http3ds, and decodes the (small) JSON body via the json.hpp
// seam. Query values are limited to archive.org identifiers (already
// URL-safe: letters, digits, '.', '_', '-'), so no percent-encoding is needed.
#include "platform/api_client.hpp"

#include <string>

#include "rom_archive/json.hpp"

namespace rom_archive {

std::optional<CatalogResponse> ApiClient::fetchCatalog() {
  std::string body;
  if (!http_.getString(baseUrl_ + "/api/catalog", body)) return std::nullopt;
  return parseCatalogResponse(body);
}

std::optional<ItemDetailResponse> ApiClient::fetchItem(const std::string& id) {
  std::string body;
  if (!http_.getString(baseUrl_ + "/api/item?id=" + id, body)) return std::nullopt;
  return parseItemDetailResponse(body);
}

std::optional<DownloadPlanResponse> ApiClient::fetchPlan(const DownloadPlanRequest& req) {
  const std::string requestJson = serializeDownloadPlanRequest(req);
  std::string body;
  if (!http_.postJson(baseUrl_ + "/api/plan", requestJson, body)) return std::nullopt;
  return parseDownloadPlanResponse(body);
}

std::optional<ResolveResponse> ApiClient::resolveScan(const ScanPointer& pointer) {
  const std::string requestJson = serializeScanPointer(pointer);
  std::string body;
  if (!http_.postJson(baseUrl_ + "/api/resolve", requestJson, body)) return std::nullopt;
  return parseResolveResponse(body);
}

}  // namespace rom_archive
