#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"

#include <algorithm>
#include <cstdint>
#include <fstream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "rom_archive/contract.hpp"
#include "rom_archive/download.hpp"
#include "rom_archive/file_sink.hpp"
#include "rom_archive/fit.hpp"
#include "rom_archive/http_client.hpp"
#include "rom_archive/json.hpp"
#include "rom_archive/md5.hpp"
#include "rom_archive/router.hpp"

using namespace rom_archive;

namespace {

std::string readFixture(const std::string& name) {
  const std::string path = std::string(ROM_ARCHIVE_FIXTURE_DIR) + "/" + name;
  std::ifstream in(path, std::ios::binary);
  REQUIRE_MESSAGE(in.good(), "missing fixture: " << path);
  std::ostringstream ss;
  ss << in.rdbuf();
  return ss.str();
}

std::vector<std::uint8_t> bytesOf(const std::string& s) {
  return std::vector<std::uint8_t>(s.begin(), s.end());
}

}  // namespace

// ---------------------------------------------------------------------------
// contract / console routing
// ---------------------------------------------------------------------------

TEST_CASE("console id round-trips and dir mapping matches the contract") {
  const std::pair<Console, const char*> expected[] = {
      {Console::Nds, "roms/nds"}, {Console::Gba, "roms/gba"},
      {Console::Gb, "roms/gb"},   {Console::Gbc, "roms/gbc"},
      {Console::Snes, "roms/snes"}, {Console::Nes, "roms/nes"},
      {Console::Gg, "roms/gg"},   {Console::Sms, "roms/sms"},
      {Console::Md, "roms/gen"},  {Console::Pce, "roms/tg16"},
  };
  for (const auto& [console, dir] : expected) {
    CHECK(consoleToRomsDir(console) == dir);
    // id round-trips both directions
    CHECK(consoleFromId(consoleId(console)).has_value());
    CHECK(*consoleFromId(consoleId(console)) == console);
  }
  CHECK_FALSE(consoleFromId("wii").has_value());
}

// ---------------------------------------------------------------------------
// sanitizeFatName / sanitizeForPlan / targetPathFor
// ---------------------------------------------------------------------------

TEST_CASE("sanitizeFatName replaces illegal characters") {
  CHECK(sanitizeFatName("a/b:c?d") == "a_b_c_d");
  CHECK(sanitizeFatName("na<me>*|\"\\.gba") == "na_me_____.gba");
  CHECK(sanitizeFatName("///") == "___");
}

TEST_CASE("sanitizeFatName trims trailing dots and spaces") {
  CHECK(sanitizeFatName("game.gba. ") == "game.gba");
  CHECK(sanitizeFatName("trailing...   ") == "trailing");
}

TEST_CASE("sanitizeFatName never returns empty") {
  CHECK(sanitizeFatName("") == "_");
  CHECK(sanitizeFatName("   ") == "_");
  CHECK(sanitizeFatName("...") == "_");
}

TEST_CASE("sanitizeForPlan disambiguates collisions") {
  // Two names that sanitize to the same string get ~1, ~2 before the extension.
  const std::vector<std::string> in = {"a:b.gba", "a/b.gba", "a<b.gba"};
  const auto out = sanitizeForPlan(in);
  REQUIRE(out.size() == 3);
  CHECK(out[0] == "a_b.gba");
  CHECK(out[1] == "a_b~1.gba");
  CHECK(out[2] == "a_b~2.gba");
  // all distinct
  CHECK(out[0] != out[1]);
  CHECK(out[1] != out[2]);
}

TEST_CASE("sanitizeForPlan collision without extension appends bare suffix") {
  const std::vector<std::string> in = {"a:b", "a/b"};
  const auto out = sanitizeForPlan(in);
  CHECK(out[0] == "a_b");
  CHECK(out[1] == "a_b~1");
}

TEST_CASE("targetPathFor routes to roms/<dir>/<name>") {
  CHECK(targetPathFor(Console::Gba, "game.gba") == "roms/gba/game.gba");
  CHECK(targetPathFor(Console::Md, "sonic.md") == "roms/gen/sonic.md");
  CHECK(targetPathFor(Console::Pce, "bonk.pce") == "roms/tg16/bonk.pce");
}

// ---------------------------------------------------------------------------
// MD5 — RFC 1321 vectors + streaming equality
// ---------------------------------------------------------------------------

TEST_CASE("md5 matches known RFC 1321 test vectors") {
  CHECK(md5Hex(nullptr, 0) == "d41d8cd98f00b204e9800998ecf8427e");        // ""
  CHECK(md5Hex(bytesOf("abc").data(), 3) == "900150983cd24fb0d6963f7d28e17f72");
  const std::string msg = "message digest";
  CHECK(md5Hex(bytesOf(msg).data(), msg.size()) == "f96b697d7cb7938d525a2f31aaf161d0");
  const std::string alpha = "abcdefghijklmnopqrstuvwxyz";
  CHECK(md5Hex(bytesOf(alpha).data(), alpha.size()) == "c3fcd3d76192e4007dfb496cca67e13b");
  // 80-char string crosses a block boundary (64 bytes).
  const std::string big =
      "12345678901234567890123456789012345678901234567890123456789012345678901234567890";
  CHECK(md5Hex(bytesOf(big).data(), big.size()) == "57edf4a22be3c955ac49da2e2107b67a");
}

TEST_CASE("md5 chunked updates equal the one-shot hash") {
  const std::string payload =
      "The quick brown fox jumps over the lazy dog. "
      "Pack my box with five dozen liquor jugs. "
      "How vexingly quick daft zebras jump!";
  const auto oneShot = md5Hex(bytesOf(payload).data(), payload.size());

  // Feed the same bytes in awkward chunk sizes.
  Md5 h;
  const auto bytes = bytesOf(payload);
  for (std::size_t i = 0; i < bytes.size();) {
    const std::size_t step = (i % 7) + 1;  // 1..7 bytes at a time
    const std::size_t len = std::min(step, bytes.size() - i);
    h.update(bytes.data() + i, len);
    i += len;
  }
  CHECK(h.finalHex() == oneShot);
}

TEST_CASE("verifyHex is case-insensitive and length-checked") {
  CHECK(verifyHex("ABCD", "abcd"));
  CHECK_FALSE(verifyHex("abcd", "abce"));
  CHECK_FALSE(verifyHex("abcd", "abc"));
}

// ---------------------------------------------------------------------------
// JSON parsing against real fixtures
// ---------------------------------------------------------------------------

TEST_CASE("parse catalog response") {
  const auto parsed = parseCatalogResponse(readFixture("catalog.json"));
  REQUIRE(parsed.has_value());
  REQUIRE(parsed->entries.size() == 3);
  CHECK(parsed->entries[0].id == "gbahomebrew");
  CHECK(parsed->entries[0].console == Console::Gba);
  CHECK(parsed->entries[0].kind == "bundle");
  CHECK_FALSE(parsed->entries[0].approxSizeBytes.has_value());
  CHECK(parsed->entries[1].approxSizeBytes.has_value());
  CHECK(*parsed->entries[1].approxSizeBytes == 5242880);
}

TEST_CASE("parse item detail response") {
  const auto parsed = parseItemDetailResponse(readFixture("item.gba.json"));
  REQUIRE(parsed.has_value());
  CHECK(parsed->id == "gbahomebrew");
  CHECK(parsed->console == Console::Gba);
  CHECK(parsed->files.size() == 10);
  for (const auto& f : parsed->files) {
    CHECK_FALSE(f.md5.empty());          // md5 is required by the contract
    CHECK(f.sizeBytes > 0);
    CHECK(f.downloadUrl.rfind("https://archive.org/download/", 0) == 0);
  }
}

TEST_CASE("parse download plan response (fits)") {
  const auto parsed = parseDownloadPlanResponse(readFixture("plan.fits.json"));
  REQUIRE(parsed.has_value());
  CHECK(parsed->fits);
  CHECK(parsed->files.size() == 10);
  CHECK_FALSE(parsed->excluded.has_value());
  for (const auto& f : parsed->files) {
    CHECK(f.targetPath.rfind("roms/gba/", 0) == 0);
  }
}

TEST_CASE("parse download plan response (partial)") {
  const auto parsed = parseDownloadPlanResponse(readFixture("plan.partial.json"));
  REQUIRE(parsed.has_value());
  CHECK_FALSE(parsed->fits);
  CHECK(parsed->files.size() == 2);
  REQUIRE(parsed->excluded.has_value());
  CHECK(parsed->excluded->size() == 8);
  for (const auto& e : *parsed->excluded) {
    CHECK(e.reason == "insufficient-space");
  }
}

TEST_CASE("parse rejects malformed json and unknown console") {
  CHECK_FALSE(parseCatalogResponse("{ not json").has_value());
  CHECK_FALSE(parseItemDetailResponse(R"({"id":"x","console":"dreamcast","files":[]})").has_value());
}

TEST_CASE("serialize download plan request") {
  DownloadPlanRequest req;
  req.id = "gbahomebrew";
  req.freeSpaceBytes = 123456;
  const auto json = serializeDownloadPlanRequest(req);
  CHECK(json.find("\"id\":\"gbahomebrew\"") != std::string::npos);
  CHECK(json.find("\"freeSpaceBytes\":123456") != std::string::npos);
  CHECK(json.find("selectedFileNames") == std::string::npos);  // omitted when absent
}

// ---------------------------------------------------------------------------
// scan pointer + resolve (QR path)
// ---------------------------------------------------------------------------

TEST_CASE("parseScanPointer accepts the pinned website wire shapes") {
  // Bundle pointer, exactly as scanPointerValue() emits it.
  const auto bundle = parseScanPointer(R"({"v":1,"id":"gbahomebrew"})");
  REQUIRE(bundle.has_value());
  CHECK(bundle->v == 1);
  CHECK(bundle->id == "gbahomebrew");
  CHECK_FALSE(bundle->file.has_value());

  // Single-ROM pointer with a filename containing spaces and parens.
  const auto single =
      parseScanPointer(R"({"v":1,"id":"gbahomebrew","file":"Metroid Fusion (USA).gba"})");
  REQUIRE(single.has_value());
  CHECK(single->id == "gbahomebrew");
  REQUIRE(single->file.has_value());
  CHECK(*single->file == "Metroid Fusion (USA).gba");
}

TEST_CASE("parseScanPointer rejects malformed / out-of-shape pointers") {
  CHECK_FALSE(parseScanPointer(R"({"v":2,"id":"gbahomebrew"})").has_value());       // wrong version
  CHECK_FALSE(parseScanPointer(R"({"v":1})").has_value());                          // missing id
  CHECK_FALSE(parseScanPointer(R"({"v":1,"id":""})").has_value());                  // empty id
  CHECK_FALSE(parseScanPointer(R"({"v":1,"id":123})").has_value());                 // non-string id
  CHECK_FALSE(parseScanPointer(R"({"v":1,"id":"x","file":5})").has_value());        // non-string file
  CHECK_FALSE(parseScanPointer(R"({"v":1,"id":"x","file":""})").has_value());       // empty file
  CHECK_FALSE(parseScanPointer(R"(["v",1])").has_value());                          // non-object
  CHECK_FALSE(parseScanPointer("not json at all").has_value());                     // garbage
}

TEST_CASE("parseScanPointer ignores unknown extra keys") {
  const auto p = parseScanPointer(R"({"v":1,"id":"gbahomebrew","extra":"ignored"})");
  REQUIRE(p.has_value());
  CHECK(p->id == "gbahomebrew");
  CHECK_FALSE(p->file.has_value());
}

TEST_CASE("serializeScanPointer emits canonical v -> id -> file order") {
  ScanPointer bundle;
  bundle.v = 1;
  bundle.id = "gbahomebrew";
  CHECK(serializeScanPointer(bundle) == R"({"v":1,"id":"gbahomebrew"})");

  ScanPointer single;
  single.v = 1;
  single.id = "gbahomebrew";
  single.file = "Metroid Fusion (USA).gba";
  CHECK(serializeScanPointer(single) ==
        R"({"v":1,"id":"gbahomebrew","file":"Metroid Fusion (USA).gba"})");

  // Round-trip: serialize -> parse recovers the same pointer.
  const auto reparsed = parseScanPointer(serializeScanPointer(single));
  REQUIRE(reparsed.has_value());
  CHECK(reparsed->id == single.id);
  REQUIRE(reparsed->file.has_value());
  CHECK(*reparsed->file == *single.file);
}

TEST_CASE("parseResolveResponse maps a resolve payload into the mirrored struct") {
  const auto parsed = parseResolveResponse(readFixture("resolve.gba.json"));
  REQUIRE(parsed.has_value());
  CHECK(parsed->id == "gbahomebrew");
  CHECK(parsed->console == Console::Gba);
  CHECK(parsed->totalBytes == 3145728);
  REQUIRE(parsed->files.size() == 2);

  // First file carries cover fields.
  const auto& withCover = parsed->files[0];
  CHECK(withCover.name == "Metroid Fusion (USA).gba");
  CHECK(withCover.targetPath == "roms/gba/Metroid Fusion (USA).gba");
  CHECK_FALSE(withCover.md5.empty());
  REQUIRE(withCover.coverUrl.has_value());
  REQUIRE(withCover.coverTargetPath.has_value());
  CHECK(*withCover.coverTargetPath == "roms/gba/Metroid Fusion (USA).png");

  // Second file has no cover fields (optional absent).
  const auto& noCover = parsed->files[1];
  CHECK(noCover.name == "Unlabeled Homebrew.gba");
  CHECK_FALSE(noCover.coverUrl.has_value());
  CHECK_FALSE(noCover.coverTargetPath.has_value());
}

TEST_CASE("parseResolveResponse rejects unknown console and missing fields") {
  CHECK_FALSE(parseResolveResponse(
                  R"({"id":"x","console":"dreamcast","totalBytes":0,"files":[]})")
                  .has_value());
  CHECK_FALSE(parseResolveResponse(R"({"id":"x","console":"gba"})").has_value());  // no files
  CHECK_FALSE(parseResolveResponse("{ not json").has_value());
}

// ---------------------------------------------------------------------------
// fit-check
// ---------------------------------------------------------------------------

TEST_CASE("planFits boundary cases") {
  const auto plan = parseDownloadPlanResponse(readFixture("plan.partial.json")).value();
  const std::int64_t total = planTotalBytes(plan);
  CHECK(total == plan.totalBytes);
  CHECK(planFits(plan, total));       // exact fit
  CHECK(planFits(plan, total + 1));   // room to spare
  CHECK_FALSE(planFits(plan, total - 1));  // one byte short
}

// ---------------------------------------------------------------------------
// download orchestration with fakes
// ---------------------------------------------------------------------------

namespace {

// A fake HttpClient that serves scripted bodies per URL, emitting them in small
// chunks to exercise the streaming path.
class FakeHttp : public HttpClient {
 public:
  std::map<std::string, std::string> bodies;
  std::size_t chunkSize = 5;
  bool failUrl = false;

  HttpResult get(const std::string& url, const ChunkSink& onChunk) override {
    if (failUrl) return {false, 0, "network down"};
    const auto it = bodies.find(url);
    if (it == bodies.end()) return {false, 404, "not found"};
    const std::string& body = it->second;
    for (std::size_t i = 0; i < body.size(); i += chunkSize) {
      const std::size_t len = std::min(chunkSize, body.size() - i);
      const auto* p = reinterpret_cast<const std::uint8_t*>(body.data() + i);
      if (!onChunk(p, len)) return {false, 200, "aborted by sink"};
    }
    return {true, 200, ""};
  }
};

// An in-memory FileSink recording what was written and whether files survived.
class FakeSink : public FileSink {
 public:
  std::map<std::string, std::string> committed;  // path -> contents
  std::string current;
  std::string buffer;

  bool open(const std::string& targetPath) override {
    current = targetPath;
    buffer.clear();
    return true;
  }
  bool write(const std::uint8_t* data, std::size_t len) override {
    buffer.append(reinterpret_cast<const char*>(data), len);
    return true;
  }
  bool close() override {
    committed[current] = buffer;
    current.clear();
    return true;
  }
  void remove(const std::string& targetPath) override { committed.erase(targetPath); }
};

DownloadPlanResponse makePlan(const std::string& body, const std::string& md5) {
  DownloadPlanResponse plan;
  plan.fits = true;
  PlanFile f;
  f.name = "rom.gba";
  f.sizeBytes = static_cast<std::int64_t>(body.size());
  f.md5 = md5;
  f.downloadUrl = "https://archive.org/download/x/rom.gba";
  f.targetPath = "roms/gba/rom.gba";
  plan.files.push_back(f);
  plan.totalBytes = f.sizeBytes;
  plan.freeSpaceBytes = 1000000;
  return plan;
}

}  // namespace

TEST_CASE("downloadPlan streams, verifies, and routes a good file") {
  const std::string body = "PROVE THIS ROM STREAMS THROUGH CHUNK BY CHUNK";
  const std::string good = md5Hex(bytesOf(body).data(), body.size());
  const auto plan = makePlan(body, good);

  FakeHttp http;
  http.bodies[plan.files[0].downloadUrl] = body;
  FakeSink sink;

  const auto report = downloadPlan(http, sink, plan);
  REQUIRE(report.files.size() == 1);
  CHECK(report.files[0].status == DownloadStatus::Ok);
  CHECK(report.allOk());
  // The file landed at the right path with the exact bytes.
  REQUIRE(sink.committed.count("roms/gba/rom.gba") == 1);
  CHECK(sink.committed["roms/gba/rom.gba"] == body);
  CHECK(report.files[0].computedMd5 == good);
}

TEST_CASE("downloadPlan rejects and removes a corrupted file (md5 mismatch)") {
  const std::string body = "this body will not match the claimed md5";
  const std::string wrong = "00000000000000000000000000000000";
  const auto plan = makePlan(body, wrong);

  FakeHttp http;
  http.bodies[plan.files[0].downloadUrl] = body;
  FakeSink sink;

  const auto report = downloadPlan(http, sink, plan);
  REQUIRE(report.files.size() == 1);
  CHECK(report.files[0].status == DownloadStatus::Md5Mismatch);
  CHECK_FALSE(report.allOk());
  // The corrupt file must not linger on the SD card.
  CHECK(sink.committed.count("roms/gba/rom.gba") == 0);
}

TEST_CASE("downloadPlan reports an http failure") {
  const std::string body = "unused";
  const auto plan = makePlan(body, md5Hex(bytesOf(body).data(), body.size()));

  FakeHttp http;
  http.failUrl = true;
  FakeSink sink;

  const auto report = downloadPlan(http, sink, plan);
  REQUIRE(report.files.size() == 1);
  CHECK(report.files[0].status == DownloadStatus::HttpError);
  CHECK(sink.committed.count("roms/gba/rom.gba") == 0);
}

TEST_CASE("downloadPlan rejects a targetPath that escapes roms/") {
  const std::string body = "malicious";
  const std::string good = md5Hex(bytesOf(body).data(), body.size());

  auto plan = makePlan(body, good);
  FakeHttp http;
  http.bodies[plan.files[0].downloadUrl] = body;

  SUBCASE("parent traversal") { plan.files[0].targetPath = "roms/gba/../../evil.txt"; }
  SUBCASE("outside roms") { plan.files[0].targetPath = "sys/evil.txt"; }
  SUBCASE("absolute-ish") { plan.files[0].targetPath = "/etc/evil"; }

  FakeSink sink;
  const auto report = downloadPlan(http, sink, plan);
  REQUIRE(report.files.size() == 1);
  CHECK(report.files[0].status == DownloadStatus::UnsafePath);
  CHECK_FALSE(report.allOk());
  // Nothing was ever opened or written for an unsafe path.
  CHECK(sink.committed.empty());
}
