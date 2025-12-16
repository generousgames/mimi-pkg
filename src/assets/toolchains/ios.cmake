# toolchains/ios.cmake
# Minimal iOS toolchain for building static libraries with CMake + Xcode.
# Usage (examples):
#   cmake -S . -B build/ios-device-rel \
#     -G Xcode \
#     -D CMAKE_TOOLCHAIN_FILE=toolchains/ios.cmake \
#     -D CMAKE_OSX_SYSROOT=iphoneos \
#     -D CMAKE_OSX_ARCHITECTURES=arm64 \
#     -D CMAKE_OSX_DEPLOYMENT_TARGET=13.0 \
#     -D CMAKE_BUILD_TYPE=Release
#
#   cmake -S . -B build/ios-sim-rel \
#     -G Xcode \
#     -D CMAKE_TOOLCHAIN_FILE=toolchains/ios.cmake \
#     -D CMAKE_OSX_SYSROOT=iphonesimulator \
#     -D CMAKE_OSX_ARCHITECTURES=arm64 \
#     -D CMAKE_OSX_DEPLOYMENT_TARGET=13.0 \
#     -D CMAKE_BUILD_TYPE=Release

# Tell CMake we’re cross-building for iOS.
set(CMAKE_SYSTEM_NAME iOS)
# (Optional) Prevent try-compile from attempting to run built binaries.
set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)

# Check that the required variables are set.
if(NOT CMAKE_OSX_ARCHITECTURES)
  message(ERROR "CMAKE_OSX_ARCHITECTURES is not set")
endif()
if(NOT CMAKE_OSX_DEPLOYMENT_TARGET)
  message(ERROR "CMAKE_OSX_DEPLOYMENT_TARGET is not set")
endif()

# Common defaults; can be overridden by presets/CLI.
if(NOT CMAKE_OSX_SYSROOT)
  # Choose device by default; presets should set explicitly.
  set(CMAKE_OSX_SYSROOT iphoneos CACHE STRING "iOS SDK to use")
endif()

# Build static libs by default for prebuilts.
set(BUILD_SHARED_LIBS OFF CACHE BOOL "Build shared libraries")

# Position independent code is generally expected for libs.
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Xcode-specific toggles (CMake forwards these as project attributes).
# Bitcode is deprecated on modern Xcodes, but some toolchains still expect a value.
set(CMAKE_XCODE_ATTRIBUTE_ENABLE_BITCODE "NO")
# Build for the selected active arch only during local builds; CI can override to speed up.
set(CMAKE_XCODE_ATTRIBUTE_ONLY_ACTIVE_ARCH "NO")
# Avoid code signing for prebuilts.
set(CMAKE_XCODE_ATTRIBUTE_CODE_SIGNING_ALLOWED "NO")
set(CMAKE_XCODE_ATTRIBUTE_CODE_SIGN_IDENTITY "")

# Ensure release builds get standard optimizations; RelWithDebInfo is also common for SDKs.
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE "Release" CACHE STRING "Build type" FORCE)
endif()

# iOS: we usually don’t need SIP/rpath tricks; these are static libs. Leave rpaths off.
set(CMAKE_SKIP_RPATH ON)

# Helpful for libraries that key off Apple platforms
set(APPLE TRUE)
