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

  // Initialise cam:u (outer camera), arm the first frame receive, and allocate
  // the quirc decoder. Returns false if the camera or decoder could not be
  // brought up (caller should surface an error and not poll). Safe to call
  // once; a second start() without a stop() is a no-op that returns the
  // current running state.
  bool start();

  // Wait briefly (one frame's worth) for the armed capture to complete; when a
  // frame lands, snapshot it for frame(), re-arm the next receive, and run one
  // quirc identify+decode pass. Bounded so the UI keeps rendering.
  QrPoll poll();

  // Free the quirc decoder, stop capture, and shut down cam:u. Idempotent and
  // order-safe so it can run from any exit path (decode, cancel, error).
  void stop();

  // The decoded payload from the most recent Found poll().
  const std::string& payload() const { return payload_; }

  // The most recent completed frame (RGB565, width()*height() pixels), for a
  // live viewfinder. Null until the first frame arrives.
  const std::uint16_t* frame() const {
    return frameCopy_.empty() ? nullptr : frameCopy_.data();
  }

  // True once per newly captured frame; reading it clears the flag so the
  // caller only re-uploads the viewfinder texture when the pixels changed.
  bool takeNewFrame() {
    const bool f = newFrame_;
    newFrame_ = false;
    return f;
  }

  static constexpr int width() { return 400; }
  static constexpr int height() { return 240; }

 private:
  // Tear down cam:u + capture state only (not quirc). Shared by stop() and the
  // start() failure path.
  void shutdownCamera();

  bool running_ = false;
  std::string payload_;

  // Opaque quirc handle (struct quirc*) kept as void* so the header stays free
  // of the vendored C types; the .cpp owns the include.
  void* quirc_ = nullptr;

  // DMA target for CAMU_SetReceiving — must be linear memory (linearAlloc),
  // NOT app heap. Owned here, freed in shutdownCamera().
  std::uint16_t* camBuf_ = nullptr;

  // CPU-side snapshot of the last completed frame; safe to read while the next
  // DMA receive is overwriting camBuf_.
  std::vector<std::uint16_t> frameCopy_;
  bool newFrame_ = false;

  // The armed receive: event handle (0 = not armed) and the transfer unit the
  // capture was configured with.
  std::uint32_t recvEvent_ = 0;
  std::uint32_t transferUnit_ = 0;

  // Consecutive poll() timeouts since the last good frame, and how many
  // clear+restart recoveries have been attempted without one.
  int timeouts_ = 0;
  int recoveries_ = 0;
};

}  // namespace rom_archive
