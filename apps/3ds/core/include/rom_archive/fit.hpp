// fit.hpp — client-side sanity fit-check, mirroring the server's math as
// defense in depth. The server already computed the plan; the device re-checks
// that the plan it received actually fits the free space it reported before
// writing a single byte.
#pragma once

#include <cstdint>

#include "rom_archive/contract.hpp"

namespace rom_archive {

// Sum of the plan's file sizes.
std::int64_t planTotalBytes(const DownloadPlanResponse& plan);

// True if the plan's files fit in the given free space. Uses freeSpaceBytes
// from the plan when they were reported; the explicit argument lets the device
// re-check against a freshly-read free-space figure.
bool planFits(const DownloadPlanResponse& plan, std::int64_t freeSpaceBytes);

}  // namespace rom_archive
