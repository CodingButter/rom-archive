// download.hpp — the orchestration: for each file in a plan, stream it from the
// HttpClient to the FileSink while computing MD5 on the fly, then verify the
// digest against the contract-supplied md5. A mismatch removes the file and
// fails that entry. This is the console-agnostic heart of the app; the platform
// layer only supplies the HttpClient and FileSink implementations.
#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>
#include <vector>

#include "rom_archive/contract.hpp"
#include "rom_archive/file_sink.hpp"
#include "rom_archive/http_client.hpp"

namespace rom_archive {

enum class DownloadStatus {
  Ok,
  HttpError,       // the transfer failed at the transport layer
  WriteError,      // the SD write failed
  Md5Mismatch,     // the file downloaded but its digest did not match
  UnsafePath,      // the server-supplied targetPath escaped roms/ — rejected
  Cancelled,       // the user aborted; this file (partial removed) and the rest
};

struct FileResult {
  std::string name;
  std::string targetPath;
  DownloadStatus status;
  std::string expectedMd5;
  std::string computedMd5;  // empty if the transfer never completed
};

struct DownloadReport {
  std::vector<FileResult> files;
  bool allOk() const {
    for (const auto& f : files) {
      if (f.status != DownloadStatus::Ok) return false;
    }
    return true;
  }
};

// Optional progress hook: called with (fileIndex, bytesDownloaded, sizeBytes)
// as each file streams — including once with 0 bytes when the file's transfer
// starts, so the UI can show "connecting" before the first chunk lands. May be
// empty.
using ProgressFn =
    std::function<void(std::size_t fileIndex, std::int64_t downloaded, std::int64_t total)>;

// Optional cancellation hook, polled between chunks. Returning true aborts the
// in-flight file (its partial is removed) and marks it plus every remaining
// file Cancelled. May be empty (never cancels).
using CancelFn = std::function<bool()>;

// Download and verify every file in the plan, in order. Stops streaming a given
// file the moment a write fails; a verify mismatch removes the file. Continues
// to the next file after a per-file failure (the report records each outcome).
DownloadReport downloadPlan(HttpClient& http, FileSink& sink,
                            const DownloadPlanResponse& plan,
                            const ProgressFn& progress = {},
                            const CancelFn& cancelled = {});

}  // namespace rom_archive
