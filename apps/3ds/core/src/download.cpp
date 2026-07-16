#include "rom_archive/download.hpp"

#include "rom_archive/md5.hpp"

namespace rom_archive {

namespace {

// Defense-in-depth: the API sanitizes filenames and routes into roms/<console>/,
// but the console still trusts the server for where bytes land on the SD. Reject
// any targetPath that is not confined under roms/ or that contains a parent
// traversal, so a buggy or hostile response can never write outside roms/.
bool isSafeTargetPath(const std::string& path) {
  if (path.rfind("roms/", 0) != 0) return false;
  if (path.find("..") != std::string::npos) return false;
  return true;
}

}  // namespace

DownloadReport downloadPlan(HttpClient& http, FileSink& sink,
                            const DownloadPlanResponse& plan,
                            const ProgressFn& progress, const CancelFn& cancelled) {
  DownloadReport report;

  for (std::size_t i = 0; i < plan.files.size(); ++i) {
    const PlanFile& file = plan.files[i];
    FileResult result;
    result.name = file.name;
    result.targetPath = file.targetPath;
    result.expectedMd5 = file.md5;
    result.status = DownloadStatus::Ok;

    // A cancel between files stops the whole plan: mark this and every
    // remaining file without touching the network or the sink.
    if (cancelled && cancelled()) {
      result.status = DownloadStatus::Cancelled;
      result.computedMd5.clear();
      for (std::size_t j = i; j < plan.files.size(); ++j) {
        FileResult skipped;
        skipped.name = plan.files[j].name;
        skipped.targetPath = plan.files[j].targetPath;
        skipped.expectedMd5 = plan.files[j].md5;
        skipped.status = DownloadStatus::Cancelled;
        report.files.push_back(skipped);
      }
      return report;
    }

    if (!isSafeTargetPath(file.targetPath)) {
      result.status = DownloadStatus::UnsafePath;
      result.detail = "rejected path: " + file.targetPath;
      report.files.push_back(result);
      continue;
    }

    // Announce the file before the transfer starts so the UI can show
    // "connecting" instead of appearing frozen until the first chunk.
    if (progress) progress(i, 0, file.sizeBytes);

    if (!sink.open(file.targetPath)) {
      result.status = DownloadStatus::WriteError;
      result.detail = "open failed: " + sink.lastError();
      report.files.push_back(result);
      continue;
    }

    Md5 hasher;
    std::int64_t downloaded = 0;
    bool writeFailed = false;
    bool wasCancelled = false;

    // The sink for the transport: each arriving chunk is both hashed and
    // written. Because the seam is chunk-callback, the whole ROM is never held
    // in memory — it flows straight through hash+write.
    const ChunkSink onChunk = [&](const std::uint8_t* data, std::size_t len) -> bool {
      if (cancelled && cancelled()) {
        wasCancelled = true;
        return false;  // abort the transfer
      }
      if (!sink.write(data, len)) {
        writeFailed = true;
        return false;  // abort the transfer
      }
      hasher.update(data, len);
      downloaded += static_cast<std::int64_t>(len);
      if (progress) progress(i, downloaded, file.sizeBytes);
      return true;
    };

    const HttpResult http_result = http.get(file.downloadUrl, onChunk);

    if (wasCancelled) {
      sink.close();
      sink.remove(file.targetPath);
      result.status = DownloadStatus::Cancelled;
      report.files.push_back(result);
      for (std::size_t j = i + 1; j < plan.files.size(); ++j) {
        FileResult skipped;
        skipped.name = plan.files[j].name;
        skipped.targetPath = plan.files[j].targetPath;
        skipped.expectedMd5 = plan.files[j].md5;
        skipped.status = DownloadStatus::Cancelled;
        report.files.push_back(skipped);
      }
      return report;
    }

    if (writeFailed) {
      const std::string reason = sink.lastError();
      sink.close();
      sink.remove(file.targetPath);
      result.status = DownloadStatus::WriteError;
      result.detail = "write failed: " + reason;
      report.files.push_back(result);
      continue;
    }

    if (!http_result.ok) {
      sink.close();
      sink.remove(file.targetPath);
      result.status = DownloadStatus::HttpError;
      result.detail = http_result.error.empty()
                          ? ("http status " + std::to_string(http_result.statusCode))
                          : http_result.error;
      report.files.push_back(result);
      continue;
    }

    if (!sink.close()) {
      const std::string reason = sink.lastError();
      sink.remove(file.targetPath);
      result.status = DownloadStatus::WriteError;
      result.detail = "close failed: " + reason;
      report.files.push_back(result);
      continue;
    }

    result.computedMd5 = hasher.finalHex();
    if (!verifyHex(result.expectedMd5, result.computedMd5)) {
      sink.remove(file.targetPath);
      result.status = DownloadStatus::Md5Mismatch;
      result.detail = "want " + result.expectedMd5 + " got " + result.computedMd5;
    }

    report.files.push_back(result);
  }

  return report;
}

}  // namespace rom_archive
