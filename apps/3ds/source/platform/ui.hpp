// ui.hpp — a small text-menu UI for the two 3DS screens. citro2d draws a
// scrollable list on the top screen and status text on the bottom. Kept
// deliberately minimal: the app is a downloader, not a game, so the UI is a
// list picker plus a progress/status readout.
#pragma once

#include <citro2d.h>

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

  // Set the scrollable list shown on the top screen and the current selection.
  // Clears any multi-select state and returns to plain single-list mode.
  void setList(std::vector<std::string> items);
  int selectedIndex() const { return selected_; }

  // Multi-select mode. When enabled, the list gains a per-row checkbox toggled
  // with A (see toggleSelected), and L/R page the view by a screen at a time.
  // Plain single-list mode (the catalog) leaves this off and A is a normal
  // "open" press handled by the caller.
  void setMultiSelect(bool on) { multiSelect_ = on; }
  bool multiSelect() const { return multiSelect_; }

  // Toggle the checkbox on the currently highlighted row. No-op unless in
  // multi-select mode.
  void toggleSelected();

  // The 0-based indices of every checked row, in ascending order.
  std::vector<int> checkedIndices() const;
  bool anyChecked() const;

  // One-line status shown on the bottom screen (e.g. "Downloading 2/5...").
  void setStatus(std::string status) { status_ = std::move(status); }

  // Render the current frame (list + status).
  void draw();

 private:
  std::vector<std::string> items_;
  int selected_ = 0;
  int scroll_ = 0;
  bool multiSelect_ = false;
  std::vector<bool> checked_;  // per-row checkbox state, sized to items_
  std::string status_;
  u32 down_ = 0;

  C3D_RenderTarget* top_ = nullptr;
  C3D_RenderTarget* bottom_ = nullptr;
  C2D_TextBuf textBuf_ = nullptr;
  u32 clrBg_ = 0;
  u32 clrText_ = 0;
  u32 clrHi_ = 0;
};

}  // namespace rom_archive
