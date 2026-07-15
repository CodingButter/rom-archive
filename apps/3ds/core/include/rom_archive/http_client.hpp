// http_client.hpp — the transport seam. Deliberately chunk-callback shaped: the
// only way to receive a response body is a callback invoked repeatedly as bytes
// arrive. There is no "return the whole body" method, so an implementation
// (including the real libctru one) cannot buffer a whole ROM in RAM — the shape
// of the interface forbids it. The platform layer fills this in (Phase 6);
// tests use a fake that emits scripted chunks.
#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>

namespace rom_archive {

// Invoked for each chunk of the response body as it arrives. Return false to
// abort the transfer (e.g. a write failure downstream).
using ChunkSink = std::function<bool(const std::uint8_t* data, std::size_t len)>;

struct HttpResult {
  bool ok;              // true if the request completed with a 2xx status
  int statusCode;       // HTTP status, or 0 if the request never got a response
  std::string error;    // human-readable failure reason when !ok
};

class HttpClient {
 public:
  virtual ~HttpClient() = default;

  // GET the url, streaming the body to `onChunk` as it arrives. Implementations
  // must follow redirects (archive.org download URLs redirect to data nodes)
  // and must never accumulate the full body themselves. If `onChunk` returns
  // false, the transfer is aborted and the result is not ok.
  virtual HttpResult get(const std::string& url, const ChunkSink& onChunk) = 0;
};

}  // namespace rom_archive
