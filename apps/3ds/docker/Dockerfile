# 3DS CIA build image: devkitARM base + makerom + bannertool.
#
# The base devkitpro/devkitarm image ships the ARM toolchain, libctru, citro2d,
# and the devkitPro general-tools (3dsxtool, smdhtool, bin2s, ...), but it does
# NOT ship makerom or bannertool — the two tools needed to package a .cia.
#
# Upstream note (deviation from the original plan): the Steveice10/buildtools
# repo the plan referenced is no longer reachable (GitHub 404 on the repo and
# its release API). We provision the two tools from their maintained homes:
#   - makerom    : 3DSGuy/Project_CTR (makerom's original author; active repo).
#                  Pinned to v0.18.4 — the newest release still linked against a
#                  glibc (<=2.34) that the bookworm-based base image (glibc 2.36)
#                  provides. v0.19.0's Ubuntu build needs GLIBC_2.38 and will not
#                  run here; v0.18.2 has a known segfault, so v0.18.4 is the
#                  correct compatible pin.
#   - bannertool : carstene1ns/3ds-bannertool (maintained CMake backup), built
#                  FROM SOURCE in-image. Its prebuilt Linux binary needs
#                  GLIBCXX_3.4.32 (GCC 13+), newer than the base image's GCC 12,
#                  so we compile it against the image's own toolchain. It vendors
#                  its image/audio libs (stb_image, dr_wav), so no extra deps.
# Versions are pinned so the build is reproducible.

FROM devkitpro/devkitarm:latest

ARG MAKEROM_VERSION=0.18.4
ARG BANNERTOOL_VERSION=1.2.3

RUN apt-get update \
    && apt-get install -y --no-install-recommends unzip ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# makerom (ubuntu x86_64 prebuilt, glibc-compatible) -> on PATH.
RUN curl -sSL -o /tmp/makerom.zip \
      "https://github.com/3DSGuy/Project_CTR/releases/download/makerom-v${MAKEROM_VERSION}/makerom-v${MAKEROM_VERSION}-ubuntu_x86_64.zip" \
    && unzip -o /tmp/makerom.zip -d /tmp/makerom \
    && install -m 0755 /tmp/makerom/makerom /opt/devkitpro/tools/bin/makerom \
    && rm -rf /tmp/makerom /tmp/makerom.zip

# bannertool (built from source against the image toolchain) -> on PATH.
RUN curl -sSL -o /tmp/bannertool.tar.gz \
      "https://github.com/carstene1ns/3ds-bannertool/archive/refs/tags/${BANNERTOOL_VERSION}.tar.gz" \
    && mkdir -p /tmp/bannertool \
    && tar -xzf /tmp/bannertool.tar.gz -C /tmp/bannertool --strip-components=1 \
    && cmake -S /tmp/bannertool -B /tmp/bannertool/build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build /tmp/bannertool/build --parallel \
    && install -m 0755 "$(find /tmp/bannertool/build -type f -name bannertool | head -1)" /opt/devkitpro/tools/bin/bannertool \
    && rm -rf /tmp/bannertool /tmp/bannertool.tar.gz

# Sanity: both tools resolve and run inside a devkitPro login shell.
RUN bash -lc 'makerom | head -2; echo "--"; bannertool 2>&1 | head -2'
