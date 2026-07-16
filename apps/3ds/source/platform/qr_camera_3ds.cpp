// qr_camera_3ds.cpp — see header. Drives the OUTER camera (cam:u) — the one
// every QR homebrew uses, since you point the console's back at the code — at
// the top screen's 400x240 into a linearAlloc RGB565 buffer (CAMU DMA requires
// linear memory, not app heap). The receive is armed once at start and re-armed
// after each completed frame; poll() waits one frame's worth on the stored
// event so the UI stays live. The init/teardown order follows the proven
// Anemone3DS/FBI sequence (trimming off, stop -> drain busy -> clear ->
// deactivate -> exit) to avoid the documented cam:u exit race. The frame is
// capped at 400x240 so quirc cannot be driven into its deep-recursion failure
// on noisy non-QR frames.
#include "platform/qr_camera_3ds.hpp"

#include <3ds.h>

#include <cstring>

#include "quirc.h"

namespace rom_archive {

namespace {
constexpr int kWidth = QrCamera::width();
constexpr int kHeight = QrCamera::height();
constexpr u32 kBufSize = kWidth * kHeight * 2;  // RGB565 = 2 bytes/pixel

// One wait per poll(), roughly one 30fps frame period, so the render loop is
// never starved even when the camera produces nothing.
constexpr s64 kWaitTimeoutNs = 33'000'000;

// ~2 seconds of consecutive timeouts before attempting a capture restart, and
// how many failed restarts to tolerate before declaring the camera dead.
constexpr int kTimeoutsBeforeRecovery = 60;
constexpr int kMaxRecoveries = 3;
}  // namespace

QrCamera::QrCamera() = default;

QrCamera::~QrCamera() { stop(); }

bool QrCamera::start() {
  if (running_) return true;

  struct quirc* q = quirc_new();
  if (!q) return false;
  if (quirc_resize(q, kWidth, kHeight) < 0) {
    quirc_destroy(q);
    return false;
  }
  quirc_ = q;

  camBuf_ = static_cast<u16*>(linearAlloc(kBufSize));
  if (!camBuf_) {
    quirc_destroy(q);
    quirc_ = nullptr;
    return false;
  }

  if (R_FAILED(camInit())) {
    linearFree(camBuf_);
    camBuf_ = nullptr;
    quirc_destroy(q);
    quirc_ = nullptr;
    return false;
  }

  // Configure the outer camera, disable trimming (without this the transfer
  // geometry can mismatch and the receive never completes), size the transfer,
  // arm the first receive, then start capture. Any failure tears down.
  bool ok = true;
  ok = ok && R_SUCCEEDED(CAMU_SetSize(SELECT_OUT1, SIZE_CTR_TOP_LCD, CONTEXT_A));
  ok = ok && R_SUCCEEDED(CAMU_SetOutputFormat(SELECT_OUT1, OUTPUT_RGB_565, CONTEXT_A));
  ok = ok && R_SUCCEEDED(CAMU_SetFrameRate(SELECT_OUT1, FRAME_RATE_30));
  ok = ok && R_SUCCEEDED(CAMU_SetNoiseFilter(SELECT_OUT1, true));
  ok = ok && R_SUCCEEDED(CAMU_SetAutoExposure(SELECT_OUT1, true));
  ok = ok && R_SUCCEEDED(CAMU_SetAutoWhiteBalance(SELECT_OUT1, true));
  ok = ok && R_SUCCEEDED(CAMU_Activate(SELECT_OUT1));
  ok = ok && R_SUCCEEDED(CAMU_SetTrimming(PORT_CAM1, false));

  u32 transferUnit = 0;
  ok = ok && R_SUCCEEDED(CAMU_GetMaxBytes(&transferUnit, kWidth, kHeight));
  ok = ok && R_SUCCEEDED(CAMU_SetTransferBytes(PORT_CAM1, transferUnit, kWidth, kHeight));
  ok = ok && R_SUCCEEDED(CAMU_ClearBuffer(PORT_CAM1));

  Handle ev = 0;
  ok = ok && R_SUCCEEDED(CAMU_SetReceiving(&ev, camBuf_, PORT_CAM1, kBufSize,
                                           static_cast<s16>(transferUnit)));
  ok = ok && R_SUCCEEDED(CAMU_StartCapture(PORT_CAM1));

  if (!ok) {
    if (ev) svcCloseHandle(ev);
    shutdownCamera();
    quirc_destroy(q);
    quirc_ = nullptr;
    return false;
  }

  recvEvent_ = ev;
  transferUnit_ = transferUnit;
  frameCopy_.clear();
  newFrame_ = false;
  timeouts_ = 0;
  recoveries_ = 0;
  running_ = true;
  return true;
}

QrPoll QrCamera::poll() {
  if (!running_ || !quirc_ || !recvEvent_) return QrPoll::Error;

  auto* q = static_cast<struct quirc*>(quirc_);

  // Wait (bounded) on the receive that was armed at start() or by the
  // previous completed frame.
  if (R_FAILED(svcWaitSynchronization(recvEvent_, kWaitTimeoutNs))) {
    // No frame this tick. Occasional timeouts are normal right after start;
    // a long run of them means the transfer wedged — clear and restart the
    // capture. Only after that recovery repeatedly fails is the camera
    // declared unusable.
    if (++timeouts_ >= kTimeoutsBeforeRecovery) {
      timeouts_ = 0;
      if (++recoveries_ > kMaxRecoveries) return QrPoll::Error;
      svcCloseHandle(recvEvent_);
      recvEvent_ = 0;
      CAMU_ClearBuffer(PORT_CAM1);
      Handle ev = 0;
      if (R_FAILED(CAMU_SetReceiving(&ev, camBuf_, PORT_CAM1, kBufSize,
                                     static_cast<s16>(transferUnit_)))) {
        return QrPoll::Error;
      }
      recvEvent_ = ev;
      CAMU_StartCapture(PORT_CAM1);
    }
    return QrPoll::NoCode;
  }

  // Frame complete. Snapshot it (the re-armed DMA below will start overwriting
  // camBuf_), then immediately arm the next receive so capture never stalls.
  svcCloseHandle(recvEvent_);
  recvEvent_ = 0;
  frameCopy_.assign(camBuf_, camBuf_ + kWidth * kHeight);
  newFrame_ = true;
  timeouts_ = 0;
  recoveries_ = 0;

  Handle ev = 0;
  if (R_FAILED(CAMU_SetReceiving(&ev, camBuf_, PORT_CAM1, kBufSize,
                                 static_cast<s16>(transferUnit_)))) {
    return QrPoll::Error;
  }
  recvEvent_ = ev;

  // Convert RGB565 -> 8-bit luma directly into quirc's image buffer.
  int qw = 0, qh = 0;
  uint8_t* image = quirc_begin(q, &qw, &qh);
  if (!image || qw != kWidth || qh != kHeight) return QrPoll::Error;
  for (int i = 0; i < kWidth * kHeight; ++i) {
    const u16 px = frameCopy_[i];
    const int r = (px >> 11) & 0x1f;
    const int g = (px >> 5) & 0x3f;
    const int b = px & 0x1f;
    // Scale channels to 8-bit and take a cheap luma. Result is 0..255.
    const int r8 = (r * 255) / 31;
    const int g8 = (g * 255) / 63;
    const int b8 = (b * 255) / 31;
    image[i] = static_cast<uint8_t>((r8 * 77 + g8 * 150 + b8 * 29) >> 8);
  }
  quirc_end(q);

  const int count = quirc_count(q);
  for (int i = 0; i < count; ++i) {
    struct quirc_code code;
    struct quirc_data data;
    quirc_extract(q, i, &code);
    quirc_decode_error_t err = quirc_decode(&code, &data);
    if (err == QUIRC_ERROR_DATA_ECC) {
      quirc_flip(&code);
      err = quirc_decode(&code, &data);
    }
    if (err == QUIRC_SUCCESS) {
      payload_.assign(reinterpret_cast<const char*>(data.payload),
                      static_cast<std::size_t>(data.payload_len));
      return QrPoll::Found;
    }
  }
  return QrPoll::NoCode;
}

void QrCamera::shutdownCamera() {
  // Proven-safe order: stop, drain the busy flag, clear, deactivate, exit.
  // Skipping the drain is the documented cam:u exit race.
  CAMU_StopCapture(PORT_CAM1);
  bool busy = false;
  for (int i = 0; i < 100 && R_SUCCEEDED(CAMU_IsBusy(&busy, PORT_CAM1)) && busy; ++i) {
    svcSleepThread(1'000'000);  // 1ms
  }
  CAMU_ClearBuffer(PORT_CAM1);
  CAMU_Activate(SELECT_NONE);
  camExit();

  if (recvEvent_) {
    svcCloseHandle(recvEvent_);
    recvEvent_ = 0;
  }
  if (camBuf_) {
    linearFree(camBuf_);
    camBuf_ = nullptr;
  }
}

void QrCamera::stop() {
  if (running_) {
    shutdownCamera();
    running_ = false;
  }
  frameCopy_.clear();
  newFrame_ = false;
  if (quirc_) {
    quirc_destroy(static_cast<struct quirc*>(quirc_));
    quirc_ = nullptr;
  }
}

}  // namespace rom_archive
