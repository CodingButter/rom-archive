# Host build for the console-agnostic core. Compiles with the system g++ (no
# devkitARM) so the logic is proven by fast native unit tests. The same sources
# are cross-compiled for ARM by apps/3ds/Makefile in Phase 6.

CXX      ?= g++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra -Wpedantic
FIXTURE_DIR := $(CURDIR)/tests/fixtures
INCLUDES := -Iinclude -Ivendor -DROM_ARCHIVE_FIXTURE_DIR='"$(FIXTURE_DIR)"'

CORE_SRC := \
	src/contract.cpp \
	src/router.cpp \
	src/md5.cpp \
	src/fit.cpp \
	src/download.cpp \
	src/json_nlohmann.cpp

TEST_SRC := tests/main.cpp

BUILD_DIR := build
TEST_BIN  := $(BUILD_DIR)/core_tests

.PHONY: all test clean

all: test

$(TEST_BIN): $(CORE_SRC) $(TEST_SRC) | $(BUILD_DIR)
	$(CXX) $(CXXFLAGS) $(INCLUDES) $(CORE_SRC) $(TEST_SRC) -o $@

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

test: $(TEST_BIN)
	$(TEST_BIN)

clean:
	rm -rf $(BUILD_DIR)
