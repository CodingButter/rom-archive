// qr_camera_3ds.cpp — see header. The capture thread is a line-for-line port
// of FBI's task_capture_cam_thread (source/core/task/capturecam.c), the QR
// scanner known to work on this exact hardware: OUTER camera at 400x240
// RGB565, heap capture buffer, trimming ENABLED with center params, infinite
// waits on {cancel, receive, buffer-error}, memcpy the completed frame to the
// shared buffer under a lock, and buffer-error recovery that clears + re-arms
// + restarts. The main thread's poll() never blocks: it lifts the newest
// shared frame and runs one quirc pass (frame capped at 400x240 so quirc
// cannot be driven into its deep-recursion failure on noisy non-QR frames).
#include "platform/qr_camera_3ds.hpp"

#include <cstdio>
#include <cstdlib>
#include <cstring>

#include "quirc.h"

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

enum { kEvCancel = 0, kEvRecv = 1, kEvBufErr = 2, kEvCount = 3 };

}  // namespace

QrCamera::QrCamera() { LightLock_Init(&lock_); }

QrCamera::~QrCamera() { stop(); }

void QrCamera::captureThreadEntry(void* arg) {
  static_cast<QrCamera*>(arg)->captureThread();
}

void QrCamera::captureThread() {
  Handle events[kEvCount] = {0};
  events[kEvCancel] = cancelEvent_;

  auto fail = [this](const char* stage, Result rc) {
    LightLock_Lock(&lock_);
    lastErrorShared_ = std::string(stage) + " " + hexResult(rc);
    LightLock_Unlock(&lock_);
    threadFailed_.store(true);
  };

  // FBI uses a plain heap buffer for the CAMU receive (capturecam.c) — proven
  // on hardware, so mirrored here (not linearAlloc).
  u16* buffer = static_cast<u16*>(std::calloc(1, kBufSize));
  if (!buffer) {
    fail("calloc", -1);
    return;
  }

  Result res = camInit();
  if (R_FAILED(res)) {
    std::free(buffer);
    fail("camInit", res);
    return;
  }

  const char* stage = nullptr;
  auto step = [&](const char* name, Result r) {
    if (R_FAILED(r)) {
      stage = name;
      res = r;
      return false;
    }
    return true;
  };

  bool ok =
      step("SetSize", CAMU_SetSize(SELECT_OUT1, SIZE_CTR_TOP_LCD, CONTEXT_A)) &&
      step("SetOutputFormat", CAMU_SetOutputFormat(SELECT_OUT1, OUTPUT_RGB_565, CONTEXT_A)) &&
      step("SetFrameRate", CAMU_SetFrameRate(SELECT_OUT1, FRAME_RATE_30)) &&
      step("SetNoiseFilter", CAMU_SetNoiseFilter(SELECT_OUT1, true)) &&
      step("SetAutoExposure", CAMU_SetAutoExposure(SELECT_OUT1, true)) &&
      step("SetAutoWhiteBalance", CAMU_SetAutoWhiteBalance(SELECT_OUT1, true)) &&
      step("Activate", CAMU_Activate(SELECT_OUT1));

  if (ok) {
    u32 transferUnit = 0;
    ok = step("GetBufferErrorInterruptEvent",
              CAMU_GetBufferErrorInterruptEvent(&events[kEvBufErr], PORT_CAM1)) &&
         step("SetTrimming", CAMU_SetTrimming(PORT_CAM1, true)) &&
         step("SetTrimmingParamsCenter",
              CAMU_SetTrimmingParamsCenter(PORT_CAM1, kWidth, kHeight, 400, 240)) &&
         step("GetMaxBytes", CAMU_GetMaxBytes(&transferUnit, kWidth, kHeight)) &&
         step("SetTransferBytes",
              CAMU_SetTransferBytes(PORT_CAM1, transferUnit, kWidth, kHeight)) &&
         step("ClearBuffer", CAMU_ClearBuffer(PORT_CAM1)) &&
         step("SetReceiving", CAMU_SetReceiving(&events[kEvRecv], buffer, PORT_CAM1,
                                                kBufSize, static_cast<s16>(transferUnit))) &&
         step("StartCapture", CAMU_StartCapture(PORT_CAM1));

    if (ok) {
      bool cancelRequested = false;
      while (!cancelRequested && R_SUCCEEDED(res)) {
        s32 index = 0;
        res = svcWaitSynchronizationN(&index, events, kEvCount, false, U64_MAX);
        if (R_FAILED(res)) {
          stage = "WaitSynchronizationN";
          break;
        }
        switch (index) {
          case kEvCancel:
            cancelRequested = true;
            break;
          case kEvRecv:
            svcCloseHandle(events[kEvRecv]);
            events[kEvRecv] = 0;

            LightLock_Lock(&lock_);
            std::memcpy(sharedBuf_.data(), buffer, kBufSize);
            LightLock_Unlock(&lock_);
            newFrameShared_.store(true);
            framesReceived_.fetch_add(1);

            res = CAMU_SetReceiving(&events[kEvRecv], buffer, PORT_CAM1, kBufSize,
                                    static_cast<s16>(transferUnit));
            if (R_FAILED(res)) stage = "SetReceiving (re-arm)";
            break;
          case kEvBufErr:
            // The port wedged (a frame completed while no receive was armed):
            // clear, re-arm, restart — FBI's exact recovery.
            svcCloseHandle(events[kEvRecv]);
            events[kEvRecv] = 0;

            if (step("ClearBuffer (recover)", CAMU_ClearBuffer(PORT_CAM1)) &&
                step("SetReceiving (recover)",
                     CAMU_SetReceiving(&events[kEvRecv], buffer, PORT_CAM1, kBufSize,
                                       static_cast<s16>(transferUnit))) &&
                step("StartCapture (recover)", CAMU_StartCapture(PORT_CAM1))) {
              // recovered
            }
            break;
          default:
            break;
        }
      }

      CAMU_StopCapture(PORT_CAM1);
      bool busy = false;
      for (int i = 0; i < 1000 && R_SUCCEEDED(CAMU_IsBusy(&busy, PORT_CAM1)) && busy; ++i) {
        svcSleepThread(1'000'000);  // 1ms
      }
      CAMU_ClearBuffer(PORT_CAM1);
    }

    CAMU_Activate(SELECT_NONE);
  }

  camExit();
  std::free(buffer);

  for (int i = kEvRecv; i < kEvCount; ++i) {  // cancelEvent_ is owned by stop()
    if (events[i]) {
      svcCloseHandle(events[i]);
      events[i] = 0;
    }
  }

  if (R_FAILED(res) && stage) fail(stage, res);
}

bool QrCamera::start() {
  if (running_) return true;
  lastError_.clear();
  lastErrorShared_.clear();
  framesReceived_.store(0);
  threadFailed_.store(false);
  newFrameShared_.store(false);
  haveFrame_ = false;
  newFrameForDraw_ = false;
  payload_.clear();

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

  sharedBuf_.assign(kWidth * kHeight, 0);
  frameCopy_.assign(kWidth * kHeight, 0);

  Result rc = svcCreateEvent(&cancelEvent_, RESET_STICKY);
  if (R_FAILED(rc)) {
    quirc_destroy(q);
    quirc_ = nullptr;
    lastError_ = "CreateEvent " + hexResult(rc);
    return false;
  }

  // Same shape as FBI's capture thread: 64 KiB stack, priority 0x1A, core 0.
  thread_ = threadCreate(&QrCamera::captureThreadEntry, this, 0x10000, 0x1A, 0, false);
  if (!thread_) {
    svcCloseHandle(cancelEvent_);
    cancelEvent_ = 0;
    quirc_destroy(q);
    quirc_ = nullptr;
    lastError_ = "threadCreate failed";
    return false;
  }

  running_ = true;
  return true;
}

QrPoll QrCamera::poll() {
  if (!running_ || !quirc_) return QrPoll::Error;

  if (threadFailed_.load()) {
    LightLock_Lock(&lock_);
    lastError_ = lastErrorShared_;
    LightLock_Unlock(&lock_);
    return QrPoll::Error;
  }

  if (!newFrameShared_.exchange(false)) return QrPoll::NoCode;

  LightLock_Lock(&lock_);
  std::memcpy(frameCopy_.data(), sharedBuf_.data(), kBufSize);
  LightLock_Unlock(&lock_);
  haveFrame_ = true;
  newFrameForDraw_ = true;

  // Convert RGB565 -> 8-bit luma directly into quirc's image buffer.
  auto* q = static_cast<struct quirc*>(quirc_);
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

void QrCamera::stop() {
  if (running_) {
    // Signal the thread (it owns the full cam:u teardown) and join it.
    svcSignalEvent(cancelEvent_);
    threadJoin(thread_, U64_MAX);
    threadFree(thread_);
    thread_ = nullptr;
    svcCloseHandle(cancelEvent_);
    cancelEvent_ = 0;
    running_ = false;
  }
  haveFrame_ = false;
  newFrameForDraw_ = false;
  if (quirc_) {
    quirc_destroy(static_cast<struct quirc*>(quirc_));
    quirc_ = nullptr;
  }
}

}  // namespace rom_archive
