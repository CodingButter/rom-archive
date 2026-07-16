// api_client.hpp — thin device-side client for the rom-archive API. Wraps the
// three endpoints (catalog, item, plan) using the httpc-backed Http3ds for
// transport and the json.hpp seam for decoding, so main/UI code deals only in
// contract structs. The base URL is compiled in via the API_BASE_URL macro.
#pragma once

#include <optional>
#include <string>

#include "platform/http_client_3ds.hpp"
#include "rom_archive/contract.hpp"

namespace rom_archive {

class ApiClient {
 public:
  explicit ApiClient(std::string baseUrl) : baseUrl_(std::move(baseUrl)) {}

  // GET /api/catalog
  std::optional<CatalogResponse> fetchCatalog();

  // GET /api/item?id=<id>
  std::optional<ItemDetailResponse> fetchItem(const std::string& id);

  // POST /api/plan with the request body; server does the fit math.
  std::optional<DownloadPlanResponse> fetchPlan(const DownloadPlanRequest& req);

  // POST /api/resolve with a scan pointer (the website QR payload); the server
  // derives the console + concrete file list. POST (not GET) so ROM filenames
  // with spaces/parens travel as a JSON body and need no URL-encoding.
  std::optional<ResolveResponse> resolveScan(const ScanPointer& pointer);

  // The transport, exposed so the download orchestrator can stream ROM bytes.
  Http3ds& http() { return http_; }

  // Failure detail of the most recent unsuccessful API call (transport stage +
  // hex result code, or HTTP status), for on-screen diagnostics.
  const std::string& lastError() const { return http_.lastError(); }

 private:
  std::string baseUrl_;
  Http3ds http_;
};

}  // namespace rom_archive
