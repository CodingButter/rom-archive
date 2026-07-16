// qr_camera_3ds.cpp — see header. Drives the inner camera (cam:u) at a small
// fixed resolution into an RGB565 buffer, converts to the 8-bit grayscale quirc
// wants, and runs one identify+decode pass per poll(). The init/teardown order
// follows the proven Anemone3DS/QRaken sequence to avoid the documented cam:u
// exit race; the frame size is capped small so quirc cannot be driven into its
// deep-recursion failure on noisy non-QR frames.
#include "platform/qr_camera_3ds.hpp"

#include <3ds.h>

#include <cstring>

#include "quirc.h"

namespace rom_archive {

namespace {
// A small capture keeps memory and quirc work bounded. 400x240 is the top
// screen's width; we capture that and downscale conceptually by feeding the raw
// frame straight to a same-sized quirc image. Kept modest on purpose.
constexpr int kWidth = 400;
constexpr int kHeight = 240;
constexpr u32 kBufSize = kWidth * kHeight * 2;  // RGB565 = 2 bytes/pixel
constexpr s64 kWaitTimeoutNs = 300'000'000;     // 300ms cap so the UI stays live
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
  frame_.assign(kWidth * kHeight, 0);

  if (R_FAILED(camInit())) {
    quirc_destroy(q);
    quirc_ = nullptr;
    return false;
  }

  // Select the inner camera, set output format and size, then start capture.
  // Any failure here tears down what was brought up and reports not-running.
  bool ok = true;
  ok = ok && R_SUCCEEDED(CAMU_SetSize(SELECT_IN1, SIZE_CTR_TOP_LCD, CONTEXT_A));
  ok = ok && R_SUCCEEDED(CAMU_SetOutputFormat(SELECT_IN1, OUTPUT_RGB_565, CONTEXT_A));
  ok = ok && R_SUCCEEDED(CAMU_SetNoiseFilter(SELECT_IN1, true));
  ok = ok && R_SUCCEEDED(CAMU_SetAutoExposure(SELECT_IN1, true));
  ok = ok && R_SUCCEEDED(CAMU_SetAutoWhiteBalance(SELECT_IN1, true));
  ok = ok && R_SUCCEEDED(CAMU_Activate(SELECT_IN1));

  u32 transferUnit = 0;
  ok = ok && R_SUCCEEDED(CAMU_GetMaxBytes(&transferUnit, kWidth, kHeight));
  ok = ok && R_SUCCEEDED(CAMU_SetTransferBytes(PORT_CAM1, transferUnit, kWidth, kHeight));
  ok = ok && R_SUCCEEDED(CAMU_ClearBuffer(PORT_CAM1));
  ok = ok && R_SUCCEEDED(CAMU_StartCapture(PORT_CAM1));

  if (!ok) {
    CAMU_Activate(SELECT_NONE);
    camExit();
    quirc_destroy(q);
    quirc_ = nullptr;
    return false;
  }

  running_ = true;
  return true;
}

QrPoll QrCamera::poll() {
  if (!running_ || !quirc_) return QrPoll::Error;

  auto* q = static_cast<struct quirc*>(quirc_);

  // Kick off a receive of one full frame into a temporary RGB565 buffer, then
  // wait (bounded) for it to complete.
  static std::vector<u16> rgb(kWidth * kHeight);
  Handle receiveEvent = 0;
  u32 transferUnit = 0;
  if (R_FAILED(CAMU_GetMaxBytes(&transferUnit, kWidth, kHeight))) return QrPoll::Error;

  if (R_FAILED(CAMU_SetReceiving(&receiveEvent, rgb.data(), PORT_CAM1, kBufSize,
                                 static_cast<s16>(transferUnit)))) {
    return QrPoll::Error;
  }

  const Result wr = svcWaitSynchronization(receiveEvent, kWaitTimeoutNs);
  svcCloseHandle(receiveEvent);
  if (R_FAILED(wr)) {
    // Timed out or errored this tick: not fatal, just no code yet. A hard
    // camera fault would surface as repeated errors the caller can bound.
    return QrPoll::NoCode;
  }

  // Convert RGB565 -> 8-bit luma directly into quirc's image buffer.
  int qw = 0, qh = 0;
  uint8_t* image = quirc_begin(q, &qw, &qh);
  if (!image || qw != kWidth || qh != kHeight) return QrPoll::Error;
  for (int i = 0; i < kWidth * kHeight; ++i) {
    const u16 px = rgb[i];
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

void QrCamera::stop() {
  if (running_) {
    CAMU_StopCapture(PORT_CAM1);
    CAMU_Activate(SELECT_NONE);
    camExit();
    running_ = false;
  }
  if (quirc_) {
    quirc_destroy(static_cast<struct quirc*>(quirc_));
    quirc_ = nullptr;
  }
}

}  // namespace rom_archive
