// ui.cpp — see header. A citro2d text list with D-pad navigation and a bottom
// status line. Rendering rebuilds a text buffer each frame (the item count is
// small), which keeps the drawing code simple and allocation-free per line.
#include "platform/ui.hpp"

#include <algorithm>

namespace rom_archive {

namespace {
constexpr int kVisibleRows = 13;   // rows that fit on the top screen
constexpr float kRowHeight = 16.0f;
constexpr float kTextScale = 0.6f;
}  // namespace

Ui::Ui() {
  gfxInitDefault();
  C3D_Init(C3D_DEFAULT_CMDBUF_SIZE);
  C2D_Init(C2D_DEFAULT_MAX_OBJECTS);
  C2D_Prepare();

  top_ = C2D_CreateScreenTarget(GFX_TOP, GFX_LEFT);
  bottom_ = C2D_CreateScreenTarget(GFX_BOTTOM, GFX_LEFT);
  textBuf_ = C2D_TextBufNew(4096);

  clrBg_ = C2D_Color32(0x1e, 0x1e, 0x2e, 0xff);
  clrText_ = C2D_Color32(0xcd, 0xd6, 0xf4, 0xff);
  clrHi_ = C2D_Color32(0x89, 0xb4, 0xfa, 0xff);
}

Ui::~Ui() {
  C2D_TextBufDelete(textBuf_);
  C2D_Fini();
  C3D_Fini();
  gfxExit();
}

bool Ui::poll() {
  hidScanInput();
  down_ = hidKeysDown();

  if (down_ & KEY_START) return false;

  if (!items_.empty()) {
    const int last = static_cast<int>(items_.size()) - 1;
    if (down_ & KEY_DOWN) selected_ = std::min<int>(selected_ + 1, last);
    if (down_ & KEY_UP) selected_ = std::max<int>(selected_ - 1, 0);

    // Multi-select mode pages a whole screen at a time with the shoulder
    // buttons — the only sane way to move through a 5000-file bundle.
    if (multiSelect_) {
      if (down_ & KEY_R) selected_ = std::min<int>(selected_ + kVisibleRows, last);
      if (down_ & KEY_L) selected_ = std::max<int>(selected_ - kVisibleRows, 0);
    }

    // Keep the selection inside the visible window.
    if (selected_ < scroll_) scroll_ = selected_;
    if (selected_ >= scroll_ + kVisibleRows) scroll_ = selected_ - kVisibleRows + 1;
  }
  return true;
}

void Ui::setList(std::vector<std::string> items) {
  items_ = std::move(items);
  selected_ = 0;
  scroll_ = 0;
  multiSelect_ = false;
  checked_.assign(items_.size(), false);
}

void Ui::toggleSelected() {
  if (!multiSelect_ || items_.empty()) return;
  if (static_cast<std::size_t>(selected_) >= checked_.size()) return;
  checked_[selected_] = !checked_[selected_];
}

std::vector<int> Ui::checkedIndices() const {
  std::vector<int> out;
  for (std::size_t i = 0; i < checked_.size(); ++i)
    if (checked_[i]) out.push_back(static_cast<int>(i));
  return out;
}

bool Ui::anyChecked() const {
  for (bool b : checked_)
    if (b) return true;
  return false;
}

void Ui::draw() {
  C3D_FrameBegin(C3D_FRAME_SYNCDRAW);
  C2D_TextBufClear(textBuf_);

  // Top screen: the scrollable list.
  C2D_TargetClear(top_, clrBg_);
  C2D_SceneBegin(top_);

  const int end = std::min<int>(scroll_ + kVisibleRows, static_cast<int>(items_.size()));
  float y = 8.0f;
  for (int i = scroll_; i < end; ++i) {
    const bool isSel = (i == selected_);
    // Draw the cursor, optional checkbox, and label as one line so the
    // checkbox never collides with a fixed text offset.
    std::string line = isSel ? "> " : "  ";
    if (multiSelect_) {
      const bool on = (static_cast<std::size_t>(i) < checked_.size()) && checked_[i];
      line += on ? "[x] " : "[ ] ";
    }
    line += items_[i];
    C2D_Text text;
    C2D_TextParse(&text, textBuf_, line.c_str());
    C2D_TextOptimize(&text);
    const u32 clr = isSel ? clrHi_ : clrText_;
    C2D_DrawText(&text, C2D_WithColor, 8.0f, y, 0.0f, kTextScale, kTextScale, clr);
    y += kRowHeight;
  }

  // Bottom screen: the status line.
  C2D_TargetClear(bottom_, clrBg_);
  C2D_SceneBegin(bottom_);
  if (!status_.empty()) {
    C2D_Text st;
    C2D_TextParse(&st, textBuf_, status_.c_str());
    C2D_TextOptimize(&st);
    C2D_DrawText(&st, C2D_WithColor, 8.0f, 8.0f, 0.0f, kTextScale, kTextScale, clrText_);
  }

  C3D_FrameEnd(0);
}

}  // namespace rom_archive
