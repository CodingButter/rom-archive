// qr_camera_3ds.hpp — the ONLY module that touches the 3DS camera (cam:u) and
// the vendored quirc decoder. Everything else (main.cpp, the UI) sees just this
// interface: start the camera, poll frames each tick, and get a decoded QR
// payload string when one is found. Isolating the camera here keeps the known
// footguns (quirc deep-recursion on junk frames, cam:u exit races) contained to
// one file with a safe, idempotent teardown.
#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace rom_archive {

// The outcome of one poll() tick.
enum class QrPoll {
  NoCode,   // captured a frame, no QR found yet (the normal case) — keep polling
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

  // Initialise cam:u and allocate the quirc decoder. Returns false if the
  // camera or decoder could not be brought up (caller should surface an error
  // and not poll). Safe to call once; a second start() without a stop() is a
  // no-op that returns the current running state.
  bool start();

  // Capture one frame and feed it to quirc. Non-blocking-ish: it waits on the
  // capture-complete event with a bounded timeout so the UI keeps rendering.
  QrPoll poll();

  // Free the quirc decoder, stop capture, and shut down cam:u. Idempotent and
  // order-safe so it can run from any exit path (decode, cancel, error).
  void stop();

  // The decoded payload from the most recent Found poll().
  const std::string& payload() const { return payload_; }

 private:
  bool running_ = false;
  std::string payload_;

  // Opaque quirc handle (struct quirc*) kept as void* so the header stays free
  // of the vendored C types; the .cpp owns the include.
  void* quirc_ = nullptr;

  // The capture buffer (RGB565), sized to the capture dimensions.
  std::vector<std::uint16_t> frame_;
};

}  // namespace rom_archive
