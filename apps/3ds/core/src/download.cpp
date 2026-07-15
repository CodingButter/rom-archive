#include "rom_archive/download.hpp"

#include "rom_archive/md5.hpp"

namespace rom_archive {

DownloadReport downloadPlan(HttpClient& http, FileSink& sink,
                            const DownloadPlanResponse& plan,
                            const ProgressFn& progress) {
  DownloadReport report;

  for (std::size_t i = 0; i < plan.files.size(); ++i) {
    const PlanFile& file = plan.files[i];
    FileResult result;
    result.name = file.name;
    result.targetPath = file.targetPath;
    result.expectedMd5 = file.md5;
    result.status = DownloadStatus::Ok;

    if (!sink.open(file.targetPath)) {
      result.status = DownloadStatus::WriteError;
      report.files.push_back(result);
      continue;
    }

    Md5 hasher;
    std::int64_t downloaded = 0;
    bool writeFailed = false;

    // The sink for the transport: each arriving chunk is both hashed and
    // written. Because the seam is chunk-callback, the whole ROM is never held
    // in memory — it flows straight through hash+write.
    const ChunkSink onChunk = [&](const std::uint8_t* data, std::size_t len) -> bool {
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

    if (writeFailed) {
      sink.close();
      sink.remove(file.targetPath);
      result.status = DownloadStatus::WriteError;
      report.files.push_back(result);
      continue;
    }

    if (!http_result.ok) {
      sink.close();
      sink.remove(file.targetPath);
      result.status = DownloadStatus::HttpError;
      report.files.push_back(result);
      continue;
    }

    if (!sink.close()) {
      sink.remove(file.targetPath);
      result.status = DownloadStatus::WriteError;
      report.files.push_back(result);
      continue;
    }

    result.computedMd5 = hasher.finalHex();
    if (!verifyHex(result.expectedMd5, result.computedMd5)) {
      sink.remove(file.targetPath);
      result.status = DownloadStatus::Md5Mismatch;
    }

    report.files.push_back(result);
  }

  return report;
}

}  // namespace rom_archive
