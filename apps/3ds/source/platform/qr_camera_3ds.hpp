// qr_camera_3ds.hpp — the ONLY module that touches the 3DS camera (cam:u) and
// the vendored quirc decoder. Everything else (main.cpp, the UI) sees just this
// interface: start the camera, poll frames each tick, and get a decoded QR
// payload string when one is found. Isolating the camera here keeps the known
// footguns (quirc deep-recursion on junk frames, cam:u exit races) contained to
// one file with a safe, idempotent teardown.
//
// Capture runs on a dedicated thread that mirrors FBI's capturecam.c exactly —
// the one QR scanner proven to work on this hardware: heap capture buffer,
// trimming ENABLED with center params, infinite event waits, and buffer-error
// recovery that re-arms without stopping capture. The main thread only copies
// the latest frame under a lock and runs the QR decode.
#pragma once

#include <3ds.h>

#include <atomic>
#include <cstdint>
#include <string>
#include <vector>

namespace rom_archive {

// The outcome of one poll() tick.
enum class QrPoll {
  NoCode,   // no new frame, or a frame with no QR (the normal case) — keep polling
  Found,    // a QR was decoded this tick; payload() holds its text
  Error,    // the camera/decoder is in an unusable state; stop() and back out
};

// A self-contained camera + QR decoder. Construct it, call start(); each frame
// call poll(); when poll() returns Found, read payload(). Call stop() on every
// exit path — it is idempotent and safe to call without a prior start().
class QrCamera {
 public:
  QrCamera();
  ~QrCamera();

  QrCamera(const QrCamera&) = delete;
  QrCamera& operator=(const QrCamera&) = delete;

  // Allocate the decoder + shared frame buffer and spawn the capture thread
  // (which owns cam:u init through teardown). Returns false only if the
  // thread/decoder could not be created; camera init failures on the thread
  // surface later as QrPoll::Error with the failing stage in lastError().
  bool start();

  // Non-blocking: grab the newest captured frame (if any) for frame(), and run
  // one quirc identify+decode pass on it. The render loop provides pacing.
  QrPoll poll();

  // Signal the capture thread to exit, join it (it tears down cam:u), and free
  // the decoder. Idempotent and order-safe from any exit path.
  void stop();

  // The decoded payload from the most recent Found poll().
  const std::string& payload() const { return payload_; }

  // Diagnostics: which camera call failed (with its hex result code), and how
  // many frames have completed since start(). Surfaced in the UI so on-device
  // failures report the actual failing stage instead of a generic message.
  const std::string& lastError() const { return lastError_; }
  int framesReceived() const { return framesReceived_.load(); }

  // The most recent completed frame (RGB565, width()*height() pixels), for a
  // live viewfinder. Null until the first frame arrives.
  const std::uint16_t* frame() const {
    return haveFrame_ ? frameCopy_.data() : nullptr;
  }

  // True once per newly captured frame; reading it clears the flag so the
  // caller only re-uploads the viewfinder texture when the pixels changed.
  bool takeNewFrame() {
    const bool f = newFrameForDraw_;
    newFrameForDraw_ = false;
    return f;
  }

  static constexpr int width() { return 400; }
  static constexpr int height() { return 240; }

 private:
  static void captureThreadEntry(void* arg);
  void captureThread();

  bool running_ = false;
  std::string payload_;

  // Opaque quirc handle (struct quirc*) kept as void* so the header stays free
  // of the vendored C types; the .cpp owns the include.
  void* quirc_ = nullptr;

  // The capture thread and its cancel event (RESET_STICKY, like FBI).
  Thread thread_ = nullptr;
  Handle cancelEvent_ = 0;

  // Frame handoff: the capture thread memcpys each completed frame into
  // sharedBuf_ under lock_ and flips newFrameShared_; poll() copies it out
  // into frameCopy_ (main-thread-only, safe for the viewfinder to read).
  LightLock lock_;
  std::vector<std::uint16_t> sharedBuf_;
  std::atomic<bool> newFrameShared_{false};
  std::vector<std::uint16_t> frameCopy_;
  bool haveFrame_ = false;
  bool newFrameForDraw_ = false;

  // Thread -> main error reporting: the failing stage (written under lock_
  // before threadFailed_ is set) and the flag poll() checks. poll() copies
  // lastErrorShared_ into lastError_ for the caller.
  std::atomic<bool> threadFailed_{false};
  std::string lastErrorShared_;
  std::string lastError_;

  std::atomic<int> framesReceived_{0};
};

}  // namespace rom_archive
