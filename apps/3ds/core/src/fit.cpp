#include "rom_archive/fit.hpp"

namespace rom_archive {

std::int64_t planTotalBytes(const DownloadPlanResponse& plan) {
  std::int64_t total = 0;
  for (const auto& f : plan.files) total += f.sizeBytes;
  return total;
}

bool planFits(const DownloadPlanResponse& plan, std::int64_t freeSpaceBytes) {
  return planTotalBytes(plan) <= freeSpaceBytes;
}

}  // namespace rom_archive
