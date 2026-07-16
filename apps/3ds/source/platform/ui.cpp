// ui.cpp — see header. A citro2d text list with D-pad navigation and a bottom
// status line. Rendering rebuilds a text buffer each frame (the item count is
// small), which keeps the drawing code simple and allocation-free per line.
#include "platform/ui.hpp"

#include <algorithm>
#include <cstring>

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
  clrBarBg_ = C2D_Color32(0x31, 0x32, 0x44, 0xff);
  clrBarFill_ = C2D_Color32(0x00, 0xcc, 0xa3, 0xff);
}

Ui::~Ui() {
  if (scanTexInit_) C3D_TexDelete(&scanTex_);
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

void Ui::setChecked(int index, bool on) {
  if (index < 0 || static_cast<std::size_t>(index) >= checked_.size()) return;
  checked_[index] = on;
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

  drawStatus();

  C3D_FrameEnd(0);
}

void Ui::drawScan(const std::uint16_t* frame, bool newFrame) {
  constexpr int kCamW = 400;
  constexpr int kCamH = 240;
  constexpr int kTexW = 512;
  constexpr int kTexH = 256;

  if (!scanTexInit_) {
    C3D_TexInit(&scanTex_, kTexW, kTexH, GPU_RGB565);
    C3D_TexSetFilter(&scanTex_, GPU_LINEAR, GPU_LINEAR);
    std::memset(scanTex_.data, 0, kTexW * kTexH * 2);
    scanTexInit_ = true;
  }

  // Upload the new frame by swizzling linear RGB565 into the GPU's tiled
  // (Morton-order, 8x8 blocks) texture layout on the CPU — the standard
  // FBI/Anemone viewfinder technique.
  if (frame && newFrame) {
    u16* dst = static_cast<u16*>(scanTex_.data);
    for (u32 y = 0; y < kCamH; ++y) {
      const u32 srcRow = y * kCamW;
      for (u32 x = 0; x < kCamW; ++x) {
        const u32 dstPos = ((((y >> 3) * (kTexW >> 3) + (x >> 3)) << 6) +
                            ((x & 1) | ((y & 1) << 1) | ((x & 2) << 1) | ((y & 2) << 2) |
                             ((x & 4) << 2) | ((y & 4) << 3)));
        dst[dstPos] = frame[srcRow + x];
      }
    }
    // The swizzle above wrote through the CPU cache; the GPU reads physical
    // memory. Without this flush the GPU samples stale/partial lines — the
    // classic "single garbled frame" symptom.
    GSPGPU_FlushDataCache(scanTex_.data, kTexW * kTexH * 2);
  }

  C3D_FrameBegin(C3D_FRAME_SYNCDRAW);
  C2D_TextBufClear(textBuf_);

  // Top screen: the viewfinder. The subtexture maps the 400x240 frame region
  // out of the 512x256 texture (t is flipped: citro2d's v axis runs upward).
  C2D_TargetClear(top_, clrBg_);
  C2D_SceneBegin(top_);
  static const Tex3DS_SubTexture kSub = {
      kCamW, kCamH, 0.0f, 1.0f, kCamW / float(kTexW), 1.0f - kCamH / float(kTexH)};
  C2D_Image img = {&scanTex_, &kSub};
  C2D_DrawImageAt(img, 0.0f, 0.0f, 0.0f, nullptr, 1.0f, 1.0f);

  drawStatus();

  C3D_FrameEnd(0);
}

void Ui::drawStatus() {
  // Bottom screen: the status text, word-wrapped so long diagnostics (result
  // codes, failing stages) stay fully readable instead of running off the
  // right edge. 42 chars is a conservative fit for the 320px screen at the
  // proportional system font's 0.6 scale.
  constexpr std::size_t kWrapCols = 42;
  constexpr int kMaxLines = 14;

  C2D_TargetClear(bottom_, clrBg_);
  C2D_SceneBegin(bottom_);

  // Progress bars (file above overall), anchored to the bottom of the screen
  // so they never collide with the wrapped status text above.
  auto drawBar = [this](float frac, float y) {
    if (frac < 0.0f) return;
    frac = std::min(1.0f, frac);
    constexpr float kBarX = 8.0f;
    constexpr float kBarW = 320.0f - 16.0f;
    constexpr float kBarH = 12.0f;
    C2D_DrawRectSolid(kBarX, y, 0.0f, kBarW, kBarH, clrBarBg_);
    if (frac > 0.0f) C2D_DrawRectSolid(kBarX, y, 0.0f, kBarW * frac, kBarH, clrBarFill_);
  };
  drawBar(fileProgress_, 240.0f - 40.0f);
  drawBar(overallProgress_, 240.0f - 22.0f);

  if (status_.empty()) return;

  float y = 8.0f;
  std::size_t pos = 0;
  for (int line = 0; line < kMaxLines && pos < status_.size(); ++line) {
    std::size_t take = std::min(kWrapCols, status_.size() - pos);
    // Prefer breaking at the last space inside the window (unless the rest
    // fits anyway), so words and hex codes stay whole when possible.
    if (pos + take < status_.size()) {
      const std::size_t space = status_.rfind(' ', pos + take);
      if (space != std::string::npos && space > pos) take = space - pos;
    }
    const std::string chunk = status_.substr(pos, take);
    C2D_Text st;
    C2D_TextParse(&st, textBuf_, chunk.c_str());
    C2D_TextOptimize(&st);
    C2D_DrawText(&st, C2D_WithColor, 8.0f, y, 0.0f, kTextScale, kTextScale, clrText_);
    y += kRowHeight;
    pos += take;
    while (pos < status_.size() && status_[pos] == ' ') ++pos;  // eat the break
  }
}

}  // namespace rom_archive
