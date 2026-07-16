// ui.hpp — a small text-menu UI for the two 3DS screens. citro2d draws a
// scrollable list on the top screen and status text on the bottom. Kept
// deliberately minimal: the app is a downloader, not a game, so the UI is a
// list picker plus a progress/status readout.
#pragma once

#include <citro2d.h>

#include <cstdint>
#include <string>
#include <vector>

namespace rom_archive {

class Ui {
 public:
  Ui();
  ~Ui();

  Ui(const Ui&) = delete;
  Ui& operator=(const Ui&) = delete;

  // Pump input for one frame. Returns false when the user asks to quit (START).
  bool poll();

  bool pressedA() const { return down_ & KEY_A; }
  bool pressedB() const { return down_ & KEY_B; }
  bool pressedX() const { return down_ & KEY_X; }
  bool pressedY() const { return down_ & KEY_Y; }
  bool pressedL() const { return down_ & KEY_L; }
  bool pressedR() const { return down_ & KEY_R; }

  // Set the scrollable list shown on the top screen and the current selection.
  // Clears any multi-select state and returns to plain single-list mode.
  void setList(std::vector<std::string> items);
  int selectedIndex() const { return selected_; }

  // Multi-select mode. When enabled, the list gains a per-row checkbox toggled
  // with X (see toggleSelected). Plain single-list mode (the catalog) leaves
  // this off and A is a normal "open" press handled by the caller. L/R are
  // surfaced via pressedL/pressedR for the caller to drive server-side paging.
  void setMultiSelect(bool on) { multiSelect_ = on; }
  bool multiSelect() const { return multiSelect_; }

  // Toggle the checkbox on the currently highlighted row. No-op unless in
  // multi-select mode.
  void toggleSelected();

  // Set the checkbox state of a specific row directly. Used to restore marks
  // when re-rendering a page whose selection is tracked externally by name.
  void setChecked(int index, bool on);

  // The 0-based indices of every checked row, in ascending order.
  std::vector<int> checkedIndices() const;
  bool anyChecked() const;

  // One-line status shown on the bottom screen (e.g. "Downloading 2/5...").
  void setStatus(std::string status) { status_ = std::move(status); }

  // Progress bars drawn under the status text on the bottom screen. Fractions
  // are clamped to [0,1]; pass a negative value to hide a bar. `file` is the
  // in-flight file, `overall` the whole plan.
  void setProgress(float file, float overall) {
    fileProgress_ = file;
    overallProgress_ = overall;
  }
  void clearProgress() { setProgress(-1.0f, -1.0f); }

  // Render the current frame (list + status).
  void draw();

  // Render the QR-scan frame: a live camera viewfinder on the top screen (the
  // 400x240 RGB565 frame, or a blank screen while the first frame is pending)
  // and the usual status line on the bottom. `newFrame` gates the texture
  // re-upload so unchanged frames cost nothing.
  void drawScan(const std::uint16_t* frame, bool newFrame);

 private:
  std::vector<std::string> items_;
  int selected_ = 0;
  int scroll_ = 0;
  bool multiSelect_ = false;
  std::vector<bool> checked_;  // per-row checkbox state, sized to items_
  std::string status_;
  float fileProgress_ = -1.0f;
  float overallProgress_ = -1.0f;
  u32 down_ = 0;

  // Draw the bottom-screen status line into the current frame. Shared by
  // draw() and drawScan().
  void drawStatus();

  C3D_RenderTarget* top_ = nullptr;
  C3D_RenderTarget* bottom_ = nullptr;
  C2D_TextBuf textBuf_ = nullptr;

  // Viewfinder texture for drawScan(), created lazily on first use. 512x256
  // because GPU textures are power-of-two; the 400x240 frame lives in the
  // top-left corner via the subtexture.
  C3D_Tex scanTex_;
  bool scanTexInit_ = false;
  u32 clrBg_ = 0;
  u32 clrText_ = 0;
  u32 clrHi_ = 0;
  u32 clrBarBg_ = 0;
  u32 clrBarFill_ = 0;
};

}  // namespace rom_archive
