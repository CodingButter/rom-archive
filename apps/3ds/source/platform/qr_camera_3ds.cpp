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

#include <cstdio>

namespace rom_archive {

namespace {

std::string hexResult(Result rc) {
  char buf[16];
  std::snprintf(buf, sizeof(buf), "0x%08lX", static_cast<unsigned long>(rc));
  return buf;
}
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
  lastError_.clear();
  framesReceived_ = 0;

  struct quirc* q = quirc_new();
  if (!q) {
    lastError_ = "quirc_new failed";
    return false;
  }
  if (quirc_resize(q, kWidth, kHeight) < 0) {
    quirc_destroy(q);
    lastError_ = "quirc_resize failed";
    return false;
  }
  quirc_ = q;

  camBuf_ = static_cast<u16*>(linearAlloc(kBufSize));
  if (!camBuf_) {
    quirc_destroy(q);
    quirc_ = nullptr;
    lastError_ = "linearAlloc failed";
    return false;
  }

  Result rc = camInit();
  if (R_FAILED(rc)) {
    linearFree(camBuf_);
    camBuf_ = nullptr;
    quirc_destroy(q);
    quirc_ = nullptr;
    lastError_ = "camInit " + hexResult(rc);
    return false;
  }

  // Configure the outer camera, disable trimming (without this the transfer
  // geometry can mismatch and the receive never completes), size the transfer,
  // arm the first receive, then start capture. Any failure tears down and
  // records WHICH call failed with its result code.
  auto step = [this](const char* name, Result r) {
    if (R_FAILED(r)) {
      lastError_ = std::string(name) + " " + hexResult(r);
      return false;
    }
    return true;
  };

  bool ok = true;
  ok = ok && step("SetSize", CAMU_SetSize(SELECT_OUT1, SIZE_CTR_TOP_LCD, CONTEXT_A));
  ok = ok && step("SetOutputFormat",
                  CAMU_SetOutputFormat(SELECT_OUT1, OUTPUT_RGB_565, CONTEXT_A));
  ok = ok && step("SetFrameRate", CAMU_SetFrameRate(SELECT_OUT1, FRAME_RATE_30));
  ok = ok && step("SetNoiseFilter", CAMU_SetNoiseFilter(SELECT_OUT1, true));
  ok = ok && step("SetAutoExposure", CAMU_SetAutoExposure(SELECT_OUT1, true));
  ok = ok && step("SetAutoWhiteBalance", CAMU_SetAutoWhiteBalance(SELECT_OUT1, true));
  ok = ok && step("Activate", CAMU_Activate(SELECT_OUT1));
  ok = ok && step("SetTrimming", CAMU_SetTrimming(PORT_CAM1, false));

  u32 transferUnit = 0;
  ok = ok && step("GetMaxBytes", CAMU_GetMaxBytes(&transferUnit, kWidth, kHeight));
  ok = ok && step("SetTransferBytes",
                  CAMU_SetTransferBytes(PORT_CAM1, transferUnit, kWidth, kHeight));
  ok = ok && step("ClearBuffer", CAMU_ClearBuffer(PORT_CAM1));

  // The buffer-error interrupt: signaled when the port wedges (a frame
  // completed while no receive was armed). poll() watches it to restart the
  // capture immediately instead of stalling.
  Handle bufErr = 0;
  ok = ok && step("GetBufferErrorInterruptEvent",
                  CAMU_GetBufferErrorInterruptEvent(&bufErr, PORT_CAM1));

  Handle ev = 0;
  ok = ok && step("SetReceiving", CAMU_SetReceiving(&ev, camBuf_, PORT_CAM1, kBufSize,
                                                    static_cast<s16>(transferUnit)));
  ok = ok && step("StartCapture", CAMU_StartCapture(PORT_CAM1));

  if (!ok) {
    if (ev) svcCloseHandle(ev);
    if (bufErr) svcCloseHandle(bufErr);
    shutdownCamera();
    quirc_destroy(q);
    quirc_ = nullptr;
    return false;
  }

  recvEvent_ = ev;
  bufErrEvent_ = bufErr;
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
    // No frame this tick. First check the buffer-error interrupt: with
    // continuous capture the port wedges whenever a frame completes while no
    // receive is armed (routine — it can happen every frame boundary), and
    // once wedged it never signals the receive again. Recover immediately:
    // stop, clear, re-arm, restart. This is the FBI/Anemone pattern and is
    // NOT counted as a failure.
    if (bufErrEvent_ &&
        R_SUCCEEDED(svcWaitSynchronization(bufErrEvent_, 0))) {
      svcClearEvent(bufErrEvent_);
      svcCloseHandle(recvEvent_);
      recvEvent_ = 0;
      CAMU_StopCapture(PORT_CAM1);
      CAMU_ClearBuffer(PORT_CAM1);
      Handle ev = 0;
      Result rc = CAMU_SetReceiving(&ev, camBuf_, PORT_CAM1, kBufSize,
                                    static_cast<s16>(transferUnit_));
      if (R_FAILED(rc)) {
        lastError_ = "re-arm SetReceiving " + hexResult(rc);
        return QrPoll::Error;
      }
      recvEvent_ = ev;
      CAMU_StartCapture(PORT_CAM1);
      timeouts_ = 0;
      return QrPoll::NoCode;
    }

    // A long run of silent timeouts (no buffer error, no frames) means the
    // transfer wedged some other way — clear and restart the capture. Only
    // after that recovery repeatedly fails is the camera declared unusable.
    if (++timeouts_ >= kTimeoutsBeforeRecovery) {
      timeouts_ = 0;
      if (++recoveries_ > kMaxRecoveries) {
        lastError_ = "no frames after " + std::to_string(kMaxRecoveries) +
                     " capture restarts";
        return QrPoll::Error;
      }
      svcCloseHandle(recvEvent_);
      recvEvent_ = 0;
      CAMU_StopCapture(PORT_CAM1);
      CAMU_ClearBuffer(PORT_CAM1);
      Handle ev = 0;
      Result rc = CAMU_SetReceiving(&ev, camBuf_, PORT_CAM1, kBufSize,
                                    static_cast<s16>(transferUnit_));
      if (R_FAILED(rc)) {
        lastError_ = "recovery SetReceiving " + hexResult(rc);
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
  ++framesReceived_;
  timeouts_ = 0;
  recoveries_ = 0;

  Handle ev = 0;
  Result rearmRc = CAMU_SetReceiving(&ev, camBuf_, PORT_CAM1, kBufSize,
                                     static_cast<s16>(transferUnit_));
  if (R_FAILED(rearmRc)) {
    lastError_ = "next-frame SetReceiving " + hexResult(rearmRc);
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
  if (bufErrEvent_) {
    svcCloseHandle(bufErrEvent_);
    bufErrEvent_ = 0;
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
