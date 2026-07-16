// main.cpp — the on-device app entry point. Wires the platform layer (httpc
// transport, SD file sink, jansson JSON) to the console-agnostic core
// (download + verify + route). The flow is a small state machine driven by the
// text-menu UI:
//
//   Catalog -> Item -> Confirm plan (with SD free space) -> Download -> Done
//
// downloadPlan() streams each ROM straight to the SD card while verifying MD5
// on the fly. ROM bytes ride through the API's /dl proxy (the 3DS SSL module
// cannot handshake archive.org's modern-cipher data nodes), so the URLs in the
// plan are already rewritten to the proxy. archive.org serves the No-Intro sets
// as one .zip per game; after a verified download this app extracts the raw ROM
// so TWiLight Menu++ (which cannot read archives) sees a playable .sfc/.gba/etc.
#include <3ds.h>

#include <algorithm>
#include <set>
#include <string>
#include <vector>

#include "platform/api_client.hpp"
#include "platform/file_sink_3ds.hpp"
#include "platform/qr_camera_3ds.hpp"
#include "platform/ui.hpp"
#include "platform/zip_extract_3ds.hpp"
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

bool endsWithZipCI(const std::string& s) {
  if (s.size() < 4) return false;
  const std::string ext = s.substr(s.size() - 4);
  return (ext[0] == '.') && (ext[1] == 'z' || ext[1] == 'Z') &&
         (ext[2] == 'i' || ext[2] == 'I') && (ext[3] == 'p' || ext[3] == 'P');
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
  int scanShownFrames = -1;

  // Paged item browsing. A bundle can hold thousands of files, so the Item
  // screen fetches one bounded page at a time (L/R page) instead of the whole
  // list. `itemPage`/`itemTotalPages` track position; `selectedNames` records
  // the user's checkbox picks by filename so a marked subset survives paging
  // (the UI's per-row checkboxes reset on each new page).
  constexpr int kItemPageSize = 100;
  std::string itemId;
  int itemPage = 1;
  int itemTotalPages = 1;
  std::set<std::string> selectedNames;

  // Load the catalog once up front so Browse is instant, then present the top
  // menu. A catalog failure is non-fatal here: Scan QR does not need it.
  ui.setStatus("Loading catalog...");
  ui.draw();
  std::string catalogError;
  if (auto c = api.fetchCatalog()) {
    catalog = *c;
    catalogLoaded = !catalog.entries.empty();
  } else {
    catalogError = api.lastError();
  }

  auto showMenu = [&]() {
    ui.setMultiSelect(false);
    ui.setList({"Browse catalog", "Scan QR code"});
    ui.setStatus("A: select   START: quit");
    screen = Screen::Menu;
  };

  // Render the current item page onto the top screen: one row per file, a [x]
  // prefix for files already marked in selectedNames (carried across pages),
  // plus a page-count status line. `item` already holds the fetched page.
  auto renderItemPage = [&]() {
    itemTotalPages =
        item.pageSize > 0
            ? static_cast<int>((item.total + item.pageSize - 1) / item.pageSize)
            : 1;
    if (itemTotalPages < 1) itemTotalPages = 1;

    // The UI draws its own [x]/[ ] checkbox in multi-select mode, so rows carry
    // only the label; setChecked below restores the mark state for this page.
    std::vector<std::string> rows;
    rows.reserve(item.files.size());
    for (const auto& f : item.files)
      rows.push_back(f.name + "  (" + bytesHuman(f.sizeBytes) + ")");
    ui.setList(std::move(rows));
    ui.setMultiSelect(true);
    for (std::size_t i = 0; i < item.files.size(); ++i)
      ui.setChecked(static_cast<int>(i), selectedNames.count(item.files[i].name) != 0);
    ui.setStatus("Page " + std::to_string(itemPage) + "/" +
                 std::to_string(itemTotalPages) + "   L/R: page  X: mark  " +
                 "A: get marked/this  Y: whole bundle  B: back");
  };

  // Fetch a 1-based item page, clamp to range, and render it. Returns false on
  // a transport/parse failure (caller shows the error screen).
  auto loadItemPage = [&](int page) -> bool {
    if (page < 1) page = 1;
    if (page > itemTotalPages) page = itemTotalPages;
    ui.setStatus("Loading page " + std::to_string(page) + "...");
    ui.draw();
    auto it = api.fetchItemPage(itemId, page, kItemPageSize);
    if (!it) return false;
    item = *it;
    itemPage = page;
    renderItemPage();
    return true;
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
              errorMsg = "Failed to load catalog." +
                         (catalogError.empty() ? std::string(" Check the network.")
                                               : " [" + catalogError + "]");
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
              scanShownFrames = -1;
              screen = Screen::Scan;
            } else {
              screen = Screen::Error;
              errorMsg = "Failed to open the camera. [" + qrCamera.lastError() + "]";
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
            errorMsg = "Could not reach the server to resolve that code." +
                       (api.lastError().empty() ? "" : " [" + api.lastError() + "]");
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
          errorMsg = "Camera error while scanning. [" + qrCamera.lastError() + "]";
        } else if (qrCamera.framesReceived() != scanShownFrames) {
          // Live capture telemetry: a rising frame count on the status line
          // proves on-device that the capture is producing frames.
          scanShownFrames = qrCamera.framesReceived();
          ui.setStatus("Aim at the QR   frames: " + std::to_string(scanShownFrames) +
                       "   B: cancel");
        }
        // QrPoll::NoCode: normal — keep polling.
        break;
      }

      case Screen::Catalog: {
        if (ui.pressedB()) {
          showMenu();
        } else if (ui.pressedA() && !catalog.entries.empty()) {
          const CatalogEntry& e = catalog.entries[ui.selectedIndex()];
          // Open the item on its first page. A bundle can hold thousands of
          // files, so we never fetch the whole list — one bounded page loads
          // fast and L/R walk the rest.
          itemId = e.id;
          itemPage = 1;
          itemTotalPages = 1;
          selectedNames.clear();
          if (loadItemPage(1)) {
            screen = Screen::Item;
          } else {
            screen = Screen::Error;
            errorMsg = "Failed to load item details." +
                       (api.lastError().empty() ? "" : " [" + api.lastError() + "]");
          }
        }
        break;
      }

      case Screen::Item: {
        if (ui.pressedB()) {
          std::vector<std::string> rows;
          for (const auto& e : catalog.entries) rows.push_back(e.title);
          ui.setList(std::move(rows));
          ui.setMultiSelect(false);
          ui.setStatus("A: open   START: quit");
          screen = Screen::Catalog;
        } else if (ui.pressedL()) {
          if (itemPage > 1 && !loadItemPage(itemPage - 1)) {
            screen = Screen::Error;
            errorMsg = "Failed to load page." +
                       (api.lastError().empty() ? "" : " [" + api.lastError() + "]");
          }
        } else if (ui.pressedR()) {
          if (itemPage < itemTotalPages && !loadItemPage(itemPage + 1)) {
            screen = Screen::Error;
            errorMsg = "Failed to load page." +
                       (api.lastError().empty() ? "" : " [" + api.lastError() + "]");
          }
        } else if (ui.pressedX()) {
          // Toggle the highlighted file's mark, mirroring it into the
          // name-keyed selection set so it survives page changes.
          ui.toggleSelected();
          const std::size_t sel = static_cast<std::size_t>(ui.selectedIndex());
          if (sel < item.files.size()) {
            const std::string& name = item.files[sel].name;
            if (selectedNames.count(name)) selectedNames.erase(name);
            else selectedNames.insert(name);
          }
        } else if (ui.pressedA() || ui.pressedY()) {
          // Y plans the whole bundle. A plans the marked subset (across every
          // page) — or, when nothing is marked, just the highlighted file.
          // Downloading everything is never the silent default: it takes Y.
          DownloadPlanRequest req;
          req.id = itemId;
          req.freeSpaceBytes = sdFreeBytes();
          if (ui.pressedY()) {
            req.selectedFileNames = std::nullopt;  // whole bundle
          } else if (!selectedNames.empty()) {
            req.selectedFileNames =
                std::vector<std::string>(selectedNames.begin(), selectedNames.end());
          } else {
            const std::size_t sel = static_cast<std::size_t>(ui.selectedIndex());
            if (sel >= item.files.size()) break;
            req.selectedFileNames = std::vector<std::string>{item.files[sel].name};
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
            errorMsg = "Failed to build download plan." +
                       (api.lastError().empty() ? "" : " [" + api.lastError() + "]");
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
            ui.setStatus("A: download this  X: mark  Y: whole bundle  L/R: page  B: back");
            screen = Screen::Item;
          }
        } else if (ui.pressedA() && !plan.files.empty()) {
          screen = Screen::Downloading;
          FileSink3ds sink;
          const std::size_t total = plan.files.size();

          // Prefix byte sums so the overall bar tracks the whole plan, not
          // just the in-flight file.
          std::vector<std::int64_t> bytesBefore(total, 0);
          for (std::size_t i = 1; i < total; ++i)
            bytesBefore[i] =
                bytesBefore[i - 1] + std::max<std::int64_t>(plan.files[i - 1].sizeBytes, 0);

          bool cancelRequested = false;
          u64 lastDrawMs = 0;
          report = downloadPlan(
              api.http(), sink, plan,
              [&](std::size_t idx, std::int64_t done, std::int64_t size) {
                // The download runs synchronously, so input and rendering are
                // pumped from here. Redraws are throttled to ~10/s (each
                // SYNCDRAW waits a VBlank) — except the 0-byte "connecting"
                // announcement and a file's final chunk, which always draw.
                hidScanInput();
                if (hidKeysDown() & KEY_B) cancelRequested = true;
                const u64 now = osGetTime();
                if (done > 0 && done < size && now - lastDrawMs < 100) return;
                lastDrawMs = now;

                const std::int64_t planDone = bytesBefore[idx] + done;
                ui.setProgress(
                    size > 0 ? static_cast<float>(static_cast<double>(done) / size) : 0.0f,
                    plan.totalBytes > 0
                        ? static_cast<float>(static_cast<double>(planDone) / plan.totalBytes)
                        : 0.0f);
                ui.setStatus(
                    "File " + std::to_string(idx + 1) + "/" + std::to_string(total) +
                    (done == 0 ? "  connecting..."
                               : "  " + bytesHuman(done) + " / " + bytesHuman(size)) +
                    "   Total " + bytesHuman(planDone) + " / " + bytesHuman(plan.totalBytes) +
                    "   B: cancel");
                ui.draw();
              },
              [&] { return cancelRequested; });
          ui.clearProgress();

          // archive.org ships the No-Intro sets as one .zip per game, but
          // TWiLight Menu++ cannot read archives — it needs the extracted ROM.
          // For every verified .zip, extract the raw ROM beside it and drop the
          // archive; on success the row now names the playable file. A failed
          // extraction leaves the verified zip in place and is surfaced as an
          // error so the user knows to extract it manually.
          {
            std::size_t zipTotal = 0, zipDone = 0;
            for (const auto& r : report.files)
              if (r.status == DownloadStatus::Ok && endsWithZipCI(r.targetPath))
                ++zipTotal;
            for (auto& r : report.files) {
              if (r.status != DownloadStatus::Ok || !endsWithZipCI(r.targetPath))
                continue;
              ui.setStatus("Extracting " + std::to_string(++zipDone) + "/" +
                           std::to_string(zipTotal) + "  " + r.name);
              ui.draw();
              ZipExtractResult ex = extractRomZip(r.targetPath);
              if (ex.ok) {
                r.targetPath = ex.romPath;
                const std::size_t slash = ex.romPath.find_last_of('/');
                r.name = slash == std::string::npos ? ex.romPath
                                                    : ex.romPath.substr(slash + 1);
              } else {
                r.status = DownloadStatus::WriteError;
                r.detail = "extract failed: " + ex.error;
              }
            }
          }

          bool anyCancelled = false;
          std::string firstFailure;
          std::vector<std::string> rows;
          for (const auto& r : report.files) {
            if (r.status == DownloadStatus::Cancelled) anyCancelled = true;
            const char* tag = r.status == DownloadStatus::Ok ? "[ok] "
                              : r.status == DownloadStatus::Md5Mismatch ? "[md5!] "
                              : r.status == DownloadStatus::WriteError ? "[write!] "
                              : r.status == DownloadStatus::UnsafePath ? "[path!] "
                              : r.status == DownloadStatus::Cancelled ? "[stop] "
                                                                      : "[net!] ";
            rows.push_back(tag + r.name);
            if (!r.detail.empty()) rows.push_back("    " + r.detail);
            if (firstFailure.empty() && r.status != DownloadStatus::Ok &&
                r.status != DownloadStatus::Cancelled && !r.detail.empty())
              firstFailure = r.detail;
          }
          ui.setList(std::move(rows));
          ui.setStatus(std::string(report.allOk() ? "All files verified. "
                                   : anyCancelled ? "Cancelled. "
                                   : firstFailure.empty() ? "Some files failed. "
                                                          : (firstFailure + "  ")) +
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
