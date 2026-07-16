// http_client_3ds.hpp — libctru httpc-backed HttpClient. Streams the response
// body to the ChunkSink in fixed-size reads (never buffering the whole ROM),
// follows archive.org's redirects to data nodes, and disables SSL peer
// verification because the 3DS SSL sysmodule ships a frozen root-CA store that
// cannot validate modern archive.org certificates.
#pragma once

#include "rom_archive/http_client.hpp"

namespace rom_archive {

class Http3ds final : public HttpClient {
 public:
  HttpResult get(const std::string& url, const ChunkSink& onChunk) override;

  // Convenience helpers for the small JSON API calls (bodies are tiny, so these
  // collect into a string). Returns false on transport error or non-2xx.
  bool getString(const std::string& url, std::string& out);
  bool postJson(const std::string& url, const std::string& body, std::string& out);

  // The failure detail (stage + hex result code, or HTTP status) of the most
  // recent unsuccessful call, for on-screen diagnostics. Empty after success.
  const std::string& lastError() const { return lastError_; }

 private:
  std::string lastError_;
};

}  // namespace rom_archive
