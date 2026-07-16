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
#include "platform/qr_camera_3ds.hpp"
#include "platform/ui.hpp"
#include "rom_archive/contract.hpp"
#include "rom_archive/download.hpp"
#include "rom_archive/json.hpp"

using namespace rom_archive;

namespace {

enum class Screen { Menu, Catalog, Scan, Item, Confirm, Downloading, Done, Error };

// Bridge a resolved scan into the plan shape the download orchestrator already
// consumes. Every ResolvedFile carries the PlanFile fields (name/size/md5/
// downloadUrl/targetPath); the server already did the fit/route work, so this
// is a straight field map with fits = true (no SD-space exclusion on the QR
// path — a single-ROM or bundle scan downloads what the server resolved).
DownloadPlanResponse planFromResolve(const ResolveResponse& r) {
  DownloadPlanResponse plan;
  plan.fits = true;
  plan.totalBytes = r.totalBytes;
  plan.freeSpaceBytes = -1;
  plan.excluded = std::nullopt;
  for (const auto& f : r.files) {
    PlanFile pf;
    pf.name = f.name;
    pf.sizeBytes = f.sizeBytes;
    pf.md5 = f.md5;
    pf.downloadUrl = f.downloadUrl;
    pf.targetPath = f.targetPath;
    plan.files.push_back(std::move(pf));
  }
  return plan;
}

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

  Screen screen = Screen::Menu;
  std::string errorMsg;

  CatalogResponse catalog;
  ItemDetailResponse item;
  DownloadPlanResponse plan;
  DownloadReport report;
  QrCamera qrCamera;
  bool catalogLoaded = false;
  bool confirmFromScan = false;

  // Load the catalog once up front so Browse is instant, then present the top
  // menu. A catalog failure is non-fatal here: Scan QR does not need it.
  ui.setStatus("Loading catalog...");
  ui.draw();
  if (auto c = api.fetchCatalog()) {
    catalog = *c;
    catalogLoaded = !catalog.entries.empty();
  }

  auto showMenu = [&]() {
    ui.setMultiSelect(false);
    ui.setList({"Browse catalog", "Scan QR code"});
    ui.setStatus("A: select   START: quit");
    screen = Screen::Menu;
  };
  showMenu();

  while (ui.poll()) {
    switch (screen) {
      case Screen::Menu: {
        if (ui.pressedA()) {
          if (ui.selectedIndex() == 0) {
            // Browse catalog.
            if (!catalogLoaded) {
              screen = Screen::Error;
              errorMsg = "Failed to load catalog. Check the network.";
              break;
            }
            std::vector<std::string> rows;
            for (const auto& e : catalog.entries) rows.push_back(e.title);
            ui.setList(std::move(rows));
            ui.setStatus("A: open   B: back");
            screen = Screen::Catalog;
          } else {
            // Scan QR code.
            ui.setList({});
            if (qrCamera.start()) {
              ui.setStatus("Aim the back camera at the QR code   B: cancel");
              screen = Screen::Scan;
            } else {
              screen = Screen::Error;
              errorMsg = "Failed to open the camera.";
            }
          }
        }
        break;
      }

      case Screen::Scan: {
        if (ui.pressedB()) {
          qrCamera.stop();
          showMenu();
          break;
        }
        QrPoll poll = qrCamera.poll();
        if (poll == QrPoll::Found) {
          auto pointer = parseScanPointer(qrCamera.payload());
          if (!pointer) {
            ui.setStatus("Not a ROM Archive QR code. Keep scanning   B: cancel");
            break;  // stay in Scan, camera still running
          }
          qrCamera.stop();
          ui.setStatus("Resolving...");
          ui.draw();
          auto resolved = api.resolveScan(*pointer);
          if (!resolved) {
            // POST failed, the server returned an error, or the body did not
            // parse — all indistinguishable to the device, but distinct from a
            // successful resolve that happened to be empty.
            screen = Screen::Error;
            errorMsg = "Could not reach the server to resolve that code.";
            break;
          }
          if (resolved->files.empty()) {
            screen = Screen::Error;
            errorMsg = "That code resolved to no files.";
            break;
          }
          plan = planFromResolve(*resolved);
          confirmFromScan = true;
          std::vector<std::string> rows;
          for (const auto& f : plan.files)
            rows.push_back("[x] " + f.name + "  (" + bytesHuman(f.sizeBytes) + ")");
          ui.setList(std::move(rows));
          ui.setStatus("Scanned. Total " + bytesHuman(plan.totalBytes) +
                       "   A: download   B: back");
          screen = Screen::Confirm;
        } else if (poll == QrPoll::Error) {
          qrCamera.stop();
          screen = Screen::Error;
          errorMsg = "Camera error while scanning.";
        }
        // QrPoll::NoCode: normal — keep polling.
        break;
      }

      case Screen::Catalog: {
        if (ui.pressedB()) {
          showMenu();
        } else if (ui.pressedA() && !catalog.entries.empty()) {
          const CatalogEntry& e = catalog.entries[ui.selectedIndex()];
          ui.setStatus("Loading item...");
          ui.draw();
          if (auto it = api.fetchItem(e.id)) {
            item = *it;
            std::vector<std::string> rows;
            for (const auto& f : item.files)
              rows.push_back(f.name + "  (" + bytesHuman(f.sizeBytes) + ")");
            ui.setList(std::move(rows));
            ui.setMultiSelect(true);
            ui.setStatus("X: select  A: plan (all if none)  L/R: page  B: back");
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
        } else if (ui.pressedX()) {
          // Toggle the highlighted file into/out of the selection.
          ui.toggleSelected();
        } else if (ui.pressedA()) {
          // Plan the checked subset, or the whole item when nothing is checked.
          DownloadPlanRequest req;
          req.id = item.id;
          req.freeSpaceBytes = sdFreeBytes();
          if (ui.anyChecked()) {
            std::vector<std::string> chosen;
            for (int i : ui.checkedIndices())
              if (static_cast<std::size_t>(i) < item.files.size())
                chosen.push_back(item.files[i].name);
            req.selectedFileNames = std::move(chosen);
          } else {
            req.selectedFileNames = std::nullopt;  // whole item
          }
          ui.setStatus("Planning...");
          ui.draw();
          if (auto p = api.fetchPlan(req)) {
            plan = *p;
            confirmFromScan = false;
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
          if (confirmFromScan) {
            // A scanned plan has no browsed item behind it — go back to the
            // menu (where Scan QR can be re-entered).
            showMenu();
          } else {
            std::vector<std::string> rows;
            for (const auto& f : item.files)
              rows.push_back(f.name + "  (" + bytesHuman(f.sizeBytes) + ")");
            ui.setList(std::move(rows));
            ui.setMultiSelect(true);
            ui.setStatus("X: select  A: plan (all if none)  L/R: page  B: back");
            screen = Screen::Item;
          }
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
                              : r.status == DownloadStatus::UnsafePath ? "[path!] "
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
        if (ui.pressedB()) showMenu();
        break;
      }

      case Screen::Error: {
        ui.setStatus(errorMsg + "   START: quit");
        break;
      }

      case Screen::Downloading:
        break;  // driven by the progress callback above
    }

    // Scan shows the live viewfinder instead of the list screen. Checked
    // against the post-switch state so a transition out of Scan (decode,
    // cancel, error) renders its new screen the same tick.
    if (screen == Screen::Scan) {
      ui.drawScan(qrCamera.frame(), qrCamera.takeNewFrame());
    } else {
      ui.draw();
    }
  }

  httpcExit();
  return 0;
}
