// api_client.cpp — see header. Each call builds the endpoint URL, performs the
// request through Http3ds, and decodes the (small) JSON body via the json.hpp
// seam. Query values are limited to archive.org identifiers (already
// URL-safe: letters, digits, '.', '_', '-'), so no percent-encoding is needed.
#include "platform/api_client.hpp"

#include <cstddef>
#include <string>

#include "rom_archive/json.hpp"

namespace rom_archive {

namespace {

// Percent-encode a URL so it can ride as the ?u= query value of the proxy URL.
// Encodes everything outside the RFC 3986 unreserved set; this is applied to a
// full archive.org URL, so its own ':' '/' '?' '&' etc. are all escaped.
std::string urlEncode(const std::string& s) {
  static const char hex[] = "0123456789ABCDEF";
  std::string out;
  out.reserve(s.size() * 3);
  for (unsigned char c : s) {
    const bool unreserved = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
                            (c >= '0' && c <= '9') || c == '-' || c == '_' ||
                            c == '.' || c == '~';
    if (unreserved) {
      out.push_back(static_cast<char>(c));
    } else {
      out.push_back('%');
      out.push_back(hex[c >> 4]);
      out.push_back(hex[c & 0x0F]);
    }
  }
  return out;
}

constexpr char kArchivePrefix[] = "https://archive.org/";

}  // namespace

std::string ApiClient::proxyDownloadUrl(const std::string& url) const {
  constexpr std::size_t prefixLen = sizeof(kArchivePrefix) - 1;
  if (url.compare(0, prefixLen, kArchivePrefix) != 0) return url;
  return baseUrl_ + "/dl?u=" + urlEncode(url);
}

std::optional<CatalogResponse> ApiClient::fetchCatalog() {
  std::string body;
  if (!http_.getString(baseUrl_ + "/api/catalog", body)) return std::nullopt;
  return parseCatalogResponse(body);
}

std::optional<ItemDetailResponse> ApiClient::fetchItemPage(const std::string& id, int page,
                                                           int pageSize) {
  std::string body;
  const std::string url = baseUrl_ + "/api/item?id=" + urlEncode(id) +
                          "&page=" + std::to_string(page) +
                          "&pageSize=" + std::to_string(pageSize);
  if (!http_.getString(url, body)) return std::nullopt;
  return parseItemDetailResponse(body);
}

std::optional<DownloadPlanResponse> ApiClient::fetchPlan(const DownloadPlanRequest& req) {
  const std::string requestJson = serializeDownloadPlanRequest(req);
  std::string body;
  if (!http_.postJson(baseUrl_ + "/api/plan", requestJson, body)) return std::nullopt;
  auto plan = parseDownloadPlanResponse(body);
  if (plan) {
    for (auto& f : plan->files) f.downloadUrl = proxyDownloadUrl(f.downloadUrl);
  }
  return plan;
}

std::optional<ResolveResponse> ApiClient::resolveScan(const ScanPointer& pointer) {
  const std::string requestJson = serializeScanPointer(pointer);
  std::string body;
  if (!http_.postJson(baseUrl_ + "/api/resolve", requestJson, body)) return std::nullopt;
  auto resolved = parseResolveResponse(body);
  if (resolved) {
    for (auto& f : resolved->files) f.downloadUrl = proxyDownloadUrl(f.downloadUrl);
  }
  return resolved;
}

}  // namespace rom_archive
