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

  // GET /api/item?id=<id>&page=<page>&pageSize=<pageSize>
  // Returns one bounded page of the item's files plus paging metadata
  // (ItemDetailResponse::total/page/pageSize populated). `page` is 1-based.
  std::optional<ItemDetailResponse> fetchItemPage(const std::string& id, int page,
                                                  int pageSize);

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
  // Rewrite an archive.org download URL to route through the API's /dl proxy so
  // the console fetches ROM bytes over plain HTTP. archive.org's /download/ path
  // 302-redirects to a modern-cipher-only data node the 3DS cannot TLS-
  // handshake (httpc 0xD8A0A03C); the proxy does that handshake server-side.
  // Non-archive.org URLs are returned unchanged.
  std::string proxyDownloadUrl(const std::string& url) const;

  std::string baseUrl_;
  Http3ds http_;
};

}  // namespace rom_archive
