// http_client_3ds.cpp — see header. Uses libctru's httpc API. The read loop
// pulls the body in bounded chunks and hands each to the sink immediately, so
// the interface's no-buffering guarantee holds all the way down to the wire.
#include "platform/http_client_3ds.hpp"

#include <3ds.h>

#include <cstdint>
#include <cstdio>
#include <vector>

namespace rom_archive {

namespace {

constexpr std::size_t kChunkSize = 16 * 1024;  // 16 KiB read window
constexpr std::uint32_t kMaxRedirects = 8;

std::string hexResult(Result rc) {
  char buf[16];
  std::snprintf(buf, sizeof(buf), "0x%08lX", static_cast<unsigned long>(rc));
  return buf;
}

// Drive one httpc context through connection + redirect follow, then stream the
// body. On a 3xx with a Location, the context is torn down and reopened against
// the new URL (libctru does not transparently follow redirects).
//
// TLS peer verification is disabled for ALL https requests: the 3DS's frozen
// root-CA store cannot validate modern certificate chains. Note DisableVerify
// only skips chain validation — it cannot rescue a host whose TLS config has
// no cipher overlap with the 3DS SSL module (no ECDHE/GCM on 3DS). Vercel is
// such a host (handshake alert 40 -> httpc 0xD8A0A03C "cert verify failed"),
// which is why the API is reached over plain HTTP via a Cloudflare Worker
// proxy, while archive.org ROM downloads work over TLS (it still offers
// RSA/CBC suites). ROM bytes remain integrity-checked by the mandatory MD5
// verification; this is the standard 3DS homebrew tradeoff (FBI, Anemone3DS,
// Universal-Updater).
HttpResult run(std::string url, const ChunkSink& onChunk, const char* contentType,
               const std::string* postBody) {
  HttpResult result{false, 0, ""};

  for (std::uint32_t redirect = 0; redirect <= kMaxRedirects; ++redirect) {
    httpcContext ctx;
    HTTPC_RequestMethod method = postBody ? HTTPC_METHOD_POST : HTTPC_METHOD_GET;

    Result rc = httpcOpenContext(&ctx, method, url.c_str(), 1);
    if (R_FAILED(rc)) {
      result.error = "open " + hexResult(rc);
      return result;
    }

    // Peer verification off everywhere (see note above run()). Keep-alive off
    // keeps the redirect teardown simple.
    httpcSetSSLOpt(&ctx, SSLCOPT_DisableVerify);
    httpcSetKeepAlive(&ctx, HTTPC_KEEPALIVE_DISABLED);
    httpcAddRequestHeaderField(&ctx, "User-Agent", "rom-archive-3ds/1.0");

    if (postBody) {
      httpcAddRequestHeaderField(&ctx, "Content-Type",
                                 contentType ? contentType : "application/json");
      httpcAddPostDataRaw(&ctx, reinterpret_cast<const u32*>(postBody->data()),
                          static_cast<u32>(postBody->size()));
    }

    rc = httpcBeginRequest(&ctx);
    if (R_FAILED(rc)) {
      httpcCloseContext(&ctx);
      result.error = "begin " + hexResult(rc);
      return result;
    }

    // This is where TLS handshake / connection failures surface with httpc:
    // the request "begins" fine and the failure lands on the first read.
    u32 statusCode = 0;
    rc = httpcGetResponseStatusCode(&ctx, &statusCode);
    if (R_FAILED(rc)) {
      httpcCloseContext(&ctx);
      result.error = "status " + hexResult(rc);
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
      result.error = "HTTP " + std::to_string(statusCode);
      return result;
    }

    // Stream the body in bounded chunks. httpcDownloadData with a fixed buffer
    // returns HTTPC_RESULTCODE_DOWNLOADPENDING until the transfer completes.
    std::vector<std::uint8_t> buf(kChunkSize);
    for (;;) {
      u32 readLen = 0;
      rc = httpcDownloadData(&ctx, buf.data(), static_cast<u32>(buf.size()), &readLen);

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
        result.error = "read " + hexResult(rc);
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
  return run(url, onChunk, nullptr, nullptr);
}

bool Http3ds::getString(const std::string& url, std::string& out) {
  out.clear();
  HttpResult r = run(
      url,
      [&out](const std::uint8_t* data, std::size_t len) {
        out.append(reinterpret_cast<const char*>(data), len);
        return true;
      },
      nullptr, nullptr);
  lastError_ = r.ok ? "" : r.error;
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
      "application/json", &body);
  lastError_ = r.ok ? "" : r.error;
  return r.ok;
}

}  // namespace rom_archive
