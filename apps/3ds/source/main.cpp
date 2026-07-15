// main.cpp — the on-device app entry point. Wires the platform layer (httpc
// transport, SD file sink, jansson JSON) to the console-agnostic core
// (download + verify + route). The flow is a small state machine driven by the
// text-menu UI:
//
//   Catalog -> Item -> Confirm plan (with SD free space) -> Download -> Done
//
// Bytes are never proxied through the API: the plan lists direct download URLs,
// and downloadPlan() streams each straight from the source to the SD card while
// verifying MD5 on the fly.
#include <3ds.h>

#include <string>
#include <vector>

#include "platform/api_client.hpp"
#include "platform/file_sink_3ds.hpp"
#include "platform/ui.hpp"
#include "rom_archive/contract.hpp"
#include "rom_archive/download.hpp"

using namespace rom_archive;

namespace {

enum class Screen { Catalog, Item, Confirm, Downloading, Done, Error };

std::string bytesHuman(std::int64_t bytes) {
  if (bytes < 0) return "?";
  const char* units[] = {"B", "KB", "MB", "GB"};
  double v = static_cast<double>(bytes);
  int u = 0;
  while (v >= 1024.0 && u < 3) {
    v /= 1024.0;
    ++u;
  }
  char buf[32];
  std::snprintf(buf, sizeof(buf), "%.1f %s", v, units[u]);
  return buf;
}

}  // namespace

int main() {
  // Transport + filesystem services. httpc needs a shared buffer; 3 * 128 KiB
  // is comfortable for streaming reads. fs is auto-initialised by libctru, but
  // GetSdmcArchiveResource still needs the services up, which they are here.
  httpcInit(3 * 128 * 1024);

  Ui ui;
  ApiClient api(API_BASE_URL);

  Screen screen = Screen::Catalog;
  std::string errorMsg;

  CatalogResponse catalog;
  ItemDetailResponse item;
  DownloadPlanResponse plan;
  DownloadReport report;

  // Kick off by loading the catalog.
  ui.setStatus("Loading catalog...");
  ui.draw();
  if (auto c = api.fetchCatalog()) {
    catalog = *c;
    std::vector<std::string> rows;
    for (const auto& e : catalog.entries) rows.push_back(e.title);
    if (rows.empty()) {
      screen = Screen::Error;
      errorMsg = "Catalog is empty.";
    } else {
      ui.setList(std::move(rows));
      ui.setStatus("A: open   START: quit");
    }
  } else {
    screen = Screen::Error;
    errorMsg = "Failed to load catalog. Check the network.";
  }

  while (ui.poll()) {
    switch (screen) {
      case Screen::Catalog: {
        if (ui.pressedA() && !catalog.entries.empty()) {
          const CatalogEntry& e = catalog.entries[ui.selectedIndex()];
          ui.setStatus("Loading item...");
          ui.draw();
          if (auto it = api.fetchItem(e.id)) {
            item = *it;
            std::vector<std::string> rows;
            for (const auto& f : item.files)
              rows.push_back(f.name + "  (" + bytesHuman(f.sizeBytes) + ")");
            ui.setList(std::move(rows));
            ui.setStatus("A: plan all   B: back");
            screen = Screen::Item;
          } else {
            screen = Screen::Error;
            errorMsg = "Failed to load item details.";
          }
        }
        break;
      }

      case Screen::Item: {
        if (ui.pressedB()) {
          std::vector<std::string> rows;
          for (const auto& e : catalog.entries) rows.push_back(e.title);
          ui.setList(std::move(rows));
          ui.setStatus("A: open   START: quit");
          screen = Screen::Catalog;
        } else if (ui.pressedA()) {
          // Ask the server to fit the whole item into the SD free space.
          DownloadPlanRequest req;
          req.id = item.id;
          req.freeSpaceBytes = sdFreeBytes();
          req.selectedFileNames = std::nullopt;  // whole item
          ui.setStatus("Planning...");
          ui.draw();
          if (auto p = api.fetchPlan(req)) {
            plan = *p;
            std::vector<std::string> rows;
            for (const auto& f : plan.files)
              rows.push_back("[x] " + f.name + "  (" + bytesHuman(f.sizeBytes) + ")");
            if (plan.excluded) {
              for (const auto& x : *plan.excluded)
                rows.push_back("[-] " + x.name + "  (" + x.reason + ")");
            }
            ui.setList(std::move(rows));
            ui.setStatus(std::string(plan.fits ? "Fits. " : "Partial. ") + "Total " +
                         bytesHuman(plan.totalBytes) + " / free " +
                         bytesHuman(plan.freeSpaceBytes) + "   A: download   B: back");
            screen = Screen::Confirm;
          } else {
            screen = Screen::Error;
            errorMsg = "Failed to build download plan.";
          }
        }
        break;
      }

      case Screen::Confirm: {
        if (ui.pressedB()) {
          std::vector<std::string> rows;
          for (const auto& f : item.files)
            rows.push_back(f.name + "  (" + bytesHuman(f.sizeBytes) + ")");
          ui.setList(std::move(rows));
          ui.setStatus("A: plan all   B: back");
          screen = Screen::Item;
        } else if (ui.pressedA() && !plan.files.empty()) {
          screen = Screen::Downloading;
          FileSink3ds sink;
          const std::size_t total = plan.files.size();
          report = downloadPlan(
              api.http(), sink, plan,
              [&](std::size_t idx, std::int64_t done, std::int64_t size) {
                ui.setStatus("Downloading " + std::to_string(idx + 1) + "/" +
                             std::to_string(total) + "  " + bytesHuman(done) + " / " +
                             bytesHuman(size));
                ui.draw();
              });

          std::vector<std::string> rows;
          for (const auto& r : report.files) {
            const char* tag = r.status == DownloadStatus::Ok ? "[ok] "
                              : r.status == DownloadStatus::Md5Mismatch ? "[md5!] "
                              : r.status == DownloadStatus::WriteError ? "[write!] "
                                                                       : "[net!] ";
            rows.push_back(tag + r.name);
          }
          ui.setList(std::move(rows));
          ui.setStatus(std::string(report.allOk() ? "All files verified. " : "Some files failed. ") +
                       "B: back   START: quit");
          screen = Screen::Done;
        }
        break;
      }

      case Screen::Done: {
        if (ui.pressedB()) {
          std::vector<std::string> rows;
          for (const auto& e : catalog.entries) rows.push_back(e.title);
          ui.setList(std::move(rows));
          ui.setStatus("A: open   START: quit");
          screen = Screen::Catalog;
        }
        break;
      }

      case Screen::Error: {
        ui.setStatus(errorMsg + "   START: quit");
        break;
      }

      case Screen::Downloading:
        break;  // driven by the progress callback above
    }

    ui.draw();
  }

  httpcExit();
  return 0;
}
