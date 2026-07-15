// http_client_3ds.cpp — see header. Uses libctru's httpc API. The read loop
// pulls the body in bounded chunks and hands each to the sink immediately, so
// the interface's no-buffering guarantee holds all the way down to the wire.
#include "platform/http_client_3ds.hpp"

#include <3ds.h>

#include <cstdint>
#include <vector>

namespace rom_archive {

namespace {

constexpr std::size_t kChunkSize = 16 * 1024;  // 16 KiB read window
constexpr std::uint32_t kMaxRedirects = 8;

// Drive one httpc context through connection + redirect follow, then stream the
// body. On a 3xx with a Location, the context is torn down and reopened against
// the new URL (libctru does not transparently follow redirects).
//
// `insecure` disables TLS peer verification and is set ONLY for archive.org byte
// downloads, whose modern certs the frozen 3DS root-CA store cannot validate;
// integrity there is guaranteed by the mandatory MD5 check, not the transport.
// Requests to our own API keep full verification.
HttpResult run(std::string url, const ChunkSink& onChunk, const char* contentType,
               const std::string* postBody, bool insecure) {
  HttpResult result{false, 0, ""};

  for (std::uint32_t redirect = 0; redirect <= kMaxRedirects; ++redirect) {
    httpcContext ctx;
    HTTPC_RequestMethod method = postBody ? HTTPC_METHOD_POST : HTTPC_METHOD_GET;

    if (R_FAILED(httpcOpenContext(&ctx, method, url.c_str(), 1))) {
      result.error = "httpcOpenContext failed";
      return result;
    }

    // Peer verification is disabled only for archive.org byte downloads (see
    // `insecure` note above); requests to our own API keep it on. Keep-alive off
    // keeps the redirect teardown simple.
    if (insecure) {
      httpcSetSSLOpt(&ctx, SSLCOPT_DisableVerify);
    }
    httpcSetKeepAlive(&ctx, HTTPC_KEEPALIVE_DISABLED);
    httpcAddRequestHeaderField(&ctx, "User-Agent", "rom-archive-3ds/1.0");

    if (postBody) {
      httpcAddRequestHeaderField(&ctx, "Content-Type",
                                 contentType ? contentType : "application/json");
      httpcAddPostDataRaw(&ctx, reinterpret_cast<const u32*>(postBody->data()),
                          static_cast<u32>(postBody->size()));
    }

    if (R_FAILED(httpcBeginRequest(&ctx))) {
      httpcCloseContext(&ctx);
      result.error = "httpcBeginRequest failed";
      return result;
    }

    u32 statusCode = 0;
    if (R_FAILED(httpcGetResponseStatusCode(&ctx, &statusCode))) {
      httpcCloseContext(&ctx);
      result.error = "httpcGetResponseStatusCode failed";
      return result;
    }
    result.statusCode = static_cast<int>(statusCode);

    // Follow redirects manually.
    if (statusCode >= 301 && statusCode <= 308) {
      char location[2048] = {0};
      if (R_FAILED(httpcGetResponseHeader(&ctx, "Location", location, sizeof(location)))) {
        httpcCloseContext(&ctx);
        result.error = "redirect without Location";
        return result;
      }
      httpcCloseContext(&ctx);
      url = location;
      continue;
    }

    if (statusCode < 200 || statusCode >= 300) {
      httpcCloseContext(&ctx);
      result.error = "non-2xx status";
      return result;
    }

    // Stream the body in bounded chunks. httpcDownloadData with a fixed buffer
    // returns HTTPC_RESULTCODE_DOWNLOADPENDING until the transfer completes.
    std::vector<std::uint8_t> buf(kChunkSize);
    for (;;) {
      u32 readLen = 0;
      Result rc =
          httpcDownloadData(&ctx, buf.data(), static_cast<u32>(buf.size()), &readLen);

      if (readLen > 0) {
        if (!onChunk(buf.data(), readLen)) {
          httpcCloseContext(&ctx);
          result.error = "sink aborted";
          return result;
        }
      }

      if (rc == static_cast<Result>(HTTPC_RESULTCODE_DOWNLOADPENDING)) {
        continue;  // more data to come
      }
      if (R_FAILED(rc)) {
        httpcCloseContext(&ctx);
        result.error = "httpcDownloadData failed";
        return result;
      }
      break;  // rc == 0: transfer complete
    }

    httpcCloseContext(&ctx);
    result.ok = true;
    return result;
  }

  result.error = "too many redirects";
  return result;
}

}  // namespace

HttpResult Http3ds::get(const std::string& url, const ChunkSink& onChunk) {
  // Byte download from archive.org: verify-disable is scoped here only.
  return run(url, onChunk, nullptr, nullptr, /*insecure=*/true);
}

bool Http3ds::getString(const std::string& url, std::string& out) {
  out.clear();
  HttpResult r = run(
      url,
      [&out](const std::uint8_t* data, std::size_t len) {
        out.append(reinterpret_cast<const char*>(data), len);
        return true;
      },
      nullptr, nullptr, /*insecure=*/false);
  return r.ok;
}

bool Http3ds::postJson(const std::string& url, const std::string& body, std::string& out) {
  out.clear();
  HttpResult r = run(
      url,
      [&out](const std::uint8_t* data, std::size_t len) {
        out.append(reinterpret_cast<const char*>(data), len);
        return true;
      },
      "application/json", &body, /*insecure=*/false);
  return r.ok;
}

}  // namespace rom_archive
