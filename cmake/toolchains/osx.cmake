# toolchains/osx.cmake
# Minimal macOS toolchain focused on reproducible prebuilts.
# Usage (examples):
#   cmake -S . -B build/macos-arm64-rel \
#     -G Ninja \
#     -D CMAKE_TOOLCHAIN_FILE=toolchains/osx.cmake \
#     -D CMAKE_OSX_ARCHITECTURES=arm64 \
#     -D CMAKE_OSX_DEPLOYMENT_TARGET=12.0 \
#     -D CMAKE_BUILD_TYPE=Release
#
#   cmake -S . -B build/macos-x86_64-rel \
#     -G Ninja \
#     -D CMAKE_TOOLCHAIN_FILE=toolchains/osx.cmake \
#     -D CMAKE_OSX_ARCHITECTURES=x86_64 \
#     -D CMAKE_OSX_DEPLOYMENT_TARGET=10.15 \
#     -D CMAKE_BUILD_TYPE=Release

# Tell CMake the host system (native build).
set(CMAKE_SYSTEM_NAME Darwin)

# Check that the required variables are set.
if(NOT CMAKE_OSX_ARCHITECTURES)
  message(FATAL_ERROR "CMAKE_OSX_ARCHITECTURES is not set")
endif()
if(NOT CMAKE_OSX_DEPLOYMENT_TARGET)
  message(FATAL_ERROR "CMAKE_OSX_DEPLOYMENT_TARGET is not set")
endif()

# Prefer static libs for SDK-style prebuilts; can be overridden.
set(BUILD_SHARED_LIBS OFF CACHE BOOL "Build shared libraries")

set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Sensible defaults for RPATH if/when producing shared libs or sample apps.
# (No effect for static outputs.)
set(CMAKE_MACOSX_RPATH ON)
# Preserve install_name-based loading relative to @rpath for relocatable SDKs.
set(CMAKE_INSTALL_RPATH "@loader_path/../lib")
set(CMAKE_BUILD_WITH_INSTALL_RPATH OFF) # Use build rpath during build, install rpath on install.
set(CMAKE_SKIP_BUILD_RPATH OFF)
set(CMAKE_SKIP_RPATH OFF)

# Deterministic builds (helpful for cache hits across CI runs).
set(CMAKE_POLICY_DEFAULT_CMP0091 NEW) # honor CMAKE_MSVC_RUNTIME_LIBRARY (noop on macOS but safe)
set(CMAKE_POLICY_DEFAULT_CMP0042 NEW) # MACOSX_RPATH

# Default to Release if not set.
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE "Release" CACHE STRING "Build type" FORCE)
endif()
