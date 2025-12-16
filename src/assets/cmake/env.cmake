# cmake/env.cmake
cmake_minimum_required(VERSION 3.27)

# env.cmake — minimal, dependency-free environment detector
# Include with: include("${PREBUILD_UTILS_DIR}/cmake/env.cmake")

# Functions:
# build_detect_abi -> build_write_abi_json
# build_write_abi_json -> build_detect_abi

# Public vars (after detection):
#   BUILD_OS                  macos|linux|windows
#   BUILD_ARCH                arm64|x86_64|...
#   BUILD_COMPILER_FAMILY     AppleClang|Clang|GNU|MSVC|Unknown
#   BUILD_COMPILER_FRONTEND_MAJOR   e.g. 17 (Clang frontend)
#   BUILD_STDLIB              libc++|libstdc++|...
#   BUILD_DEPLOYMENT_TARGET   e.g. 14.0 (macOS)
#   BUILD_TRIPLE              e.g. macos-arm64-clang17  (overridable)
#   BUILD_ABI_JSON_PATH       where abi.json was written (if you call writer)
#   BUILD_ABI_HASH            16-hex short hash of abi.json (if you call writer)

# Prevent multiple inclusions.
if(DEFINED _BUILD_ABI_CMAKE_INCLUDED)
  return()
endif()
set(_BUILD_ABI_CMAKE_INCLUDED TRUE)

# --- Helpers ---------------------------------------------------------------

function(_build_norm_os out)
  if(CMAKE_SYSTEM_NAME STREQUAL "Darwin")
    set(v "macos")
  elseif(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    set(v "linux")
  elseif(CMAKE_SYSTEM_NAME STREQUAL "Windows")
    set(v "windows")
  else()
    set(v "${CMAKE_SYSTEM_NAME}")
  endif()
  set(${out} "${v}" PARENT_SCOPE)
endfunction()

function(_build_detect_arch_from_compiler out)
  set(_cxx "${CMAKE_CXX_COMPILER}")
  if(NOT _cxx)
    set(${out} "unknown" PARENT_SCOPE)
    return()
  endif()

  execute_process(
    COMMAND "${_cxx}" -dM -E -x c++ -
    INPUT_FILE /dev/null
    OUTPUT_VARIABLE _macros
    ERROR_QUIET
  )

  set(_arch "unknown")
  if(_macros MATCHES "#define __aarch64__ 1" OR _macros MATCHES "#define __arm64__ 1")
    set(_arch "arm64")
  elseif(_macros MATCHES "#define __x86_64__ 1")
    set(_arch "x86_64")
  elseif(_macros MATCHES "#define __i386__ 1")
    set(_arch "x86")
  elseif(_macros MATCHES "#define __ppc64__ 1")
    set(_arch "ppc64")
  endif()

  set(${out} "${_arch}" PARENT_SCOPE)
endfunction()

# function(_build_norm_arch out)
#   string(TOLOWER "${CMAKE_SYSTEM_PROCESSOR}" _cpu)
#   message(STATUS "CPU: ${_cpu}")
#   if(_cpu MATCHES "^(aarch64|arm64)$")
#     set(v "arm64")
#   elseif(_cpu MATCHES "^(x86_64|amd64)$")
#     set(v "x86_64")
#   else()
#     set(v "${_cpu}")
#   endif()
#   set(${out} "${v}" PARENT_SCOPE)
# endfunction()

# Return preprocessor macros by invoking the active C++ compiler
function(_build_cc_macros out)
  # Use the actual compiler CMake is using
  set(_cxx "${CMAKE_CXX_COMPILER}")
  if(NOT _cxx)
    set(${out} "" PARENT_SCOPE)
    return()
  endif()
  # On Windows/MSVC, emulate: cl /nologo /EP /d1PP (but keep simple fallback)
  if(CMAKE_CXX_COMPILER_ID STREQUAL "MSVC")
    execute_process(
      COMMAND "${_cxx}" /nologo /EP /d1PP -
      INPUT_FILE NUL
      OUTPUT_VARIABLE _macros
      ERROR_QUIET
    )
  else()
    execute_process(
      COMMAND "${_cxx}" -dM -E -x c++ -
      INPUT_FILE /dev/null
      OUTPUT_VARIABLE _macros
      ERROR_QUIET
    )
  endif()
  set(${out} "${_macros}" PARENT_SCOPE)
endfunction()

# --- Public: detect core fields -------------------------------------------

function(build_detect_abi)
  message(STATUS "Detecting ABI...")
  _build_norm_os(_os)
  _build_detect_arch_from_compiler(_arch)

  set(_family "Unknown")
  set(_frontend_major "")
  set(_stdlib "")
  set(_dep_target "")

  _build_cc_macros(_macros)

  if(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
    if(_macros MATCHES "#define __apple_build_version__ [0-9]+")
      set(_family "AppleClang")
    else()
      set(_family "Clang")
    endif()
    if(_macros MATCHES "#define __clang_major__ ([0-9]+)")
      set(_frontend_major "${CMAKE_MATCH_1}")
    endif()
  elseif(CMAKE_CXX_COMPILER_ID STREQUAL "GNU")
    set(_family "GNU")
    if(_macros MATCHES "#define __GNUC__ ([0-9]+)")
      set(_frontend_major "${CMAKE_MATCH_1}")
    endif()
  elseif(CMAKE_CXX_COMPILER_ID STREQUAL "MSVC")
    set(_family "MSVC")
    if(_macros MATCHES "#define _MSC_VER ([0-9]+)")
      set(_frontend_major "${CMAKE_MATCH_1}") # 19xx series; coarse but useful
    endif()
  endif()

  if(_macros MATCHES "__LIBCPP_VERSION")
    set(_stdlib "libc++")
  elseif(_macros MATCHES "__GLIBCXX__|_GLIBCXX_RELEASE")
    set(_stdlib "libstdc++")
  endif()

  if(APPLE)
    if(DEFINED CMAKE_OSX_DEPLOYMENT_TARGET AND NOT CMAKE_OSX_DEPLOYMENT_TARGET STREQUAL "")
      set(_dep_target "${CMAKE_OSX_DEPLOYMENT_TARGET}")
    elseif(DEFINED ENV{MACOSX_DEPLOYMENT_TARGET})
      set(_dep_target "$ENV{MACOSX_DEPLOYMENT_TARGET}")
    endif()
  endif()

  # Compose compiler tag
  set(_cc_tag "unknowncc")
  if(_family STREQUAL "Clang" OR _family STREQUAL "AppleClang")
    if(_frontend_major)
      set(_cc_tag "clang${_frontend_major}")
    else()
      set(_cc_tag "clang")
    endif()
  elseif(_family STREQUAL "GNU")
    if(_frontend_major)
      set(_cc_tag "gcc${_frontend_major}")
    else()
      set(_cc_tag "gcc")
    endif()
  elseif(_family STREQUAL "MSVC")
    if(_frontend_major)
      set(_cc_tag "msvc${_frontend_major}")
    else()
      set(_cc_tag "msvc")
    endif()
  endif()

  set(BUILD_OS "${_os}" CACHE STRING "")
  set(BUILD_ARCH "${_arch}" CACHE STRING "")
  set(BUILD_COMPILER_FAMILY "${_family}" CACHE STRING "")
  set(BUILD_COMPILER_FRONTEND_MAJOR "${_frontend_major}" CACHE STRING "")
  set(BUILD_STDLIB "${_stdlib}" CACHE STRING "")
  set(BUILD_DEPLOYMENT_TARGET "${_dep_target}" CACHE STRING "")

  # Compose default triple, allow env override BUILD_TRIPLE / cache override
  set(_triple_default "${_os}-${_arch}-${_cc_tag}")
  set(BUILD_TRIPLE_DEFAULT "${_triple_default}" CACHE STRING "")

  if(DEFINED ENV{BUILD_TRIPLE})
    set(_triple "$ENV{BUILD_TRIPLE}")
  else()
    # Expose cache entry so users can override from cmake -D
    set(BUILD_TRIPLE "${_triple_default}" CACHE STRING "BUILD packaging triple")
    set(_triple "${BUILD_TRIPLE}")
  endif()
  set(BUILD_TRIPLE "${_triple}" CACHE STRING "")
endfunction()

# --- Public: write abi.json and compute hash ------------------------------

function(build_write_abi_json OUT_DIR)
  if(NOT DEFINED BUILD_OS)
    build_detect_abi()
    # Pull into local scope if not set already by caller:
    set(_from_detect TRUE)
    set(_OS "${BUILD_OS}")
    set(_ARCH "${BUILD_ARCH}")
    set(_FAM "${BUILD_COMPILER_FAMILY}")
    set(_MAJ "${BUILD_COMPILER_FRONTEND_MAJOR}")
    set(_STDLIB "${BUILD_STDLIB}")
    set(_DEP "${BUILD_DEPLOYMENT_TARGET}")
    set(_TRIPLE "${BUILD_TRIPLE}")
  else()
    set(_OS "${BUILD_OS}")
    set(_ARCH "${BUILD_ARCH}")
    set(_FAM "${BUILD_COMPILER_FAMILY}")
    set(_MAJ "${BUILD_COMPILER_FRONTEND_MAJOR}")
    set(_STDLIB "${BUILD_STDLIB}")
    set(_DEP "${BUILD_DEPLOYMENT_TARGET}")
    set(_TRIPLE "${BUILD_TRIPLE}")
  endif()

  set(_dir "${OUT_DIR}")
  file(MAKE_DIRECTORY "${_dir}")

  # Keep a stable key order for deterministic hashing
  set(_json "{\n")
  string(APPEND _json "  \"triple\": \"${_TRIPLE}\",\n")
  string(APPEND _json "  \"os\": \"${_OS}\",\n")
  string(APPEND _json "  \"arch\": \"${_ARCH}\",\n")
  string(APPEND _json "  \"compilerFamily\": \"${_FAM}\",\n")
  if(_MAJ)
    string(APPEND _json "  \"compilerFrontendMajor\": ${_MAJ},\n")
  else()
    string(APPEND _json "  \"compilerFrontendMajor\": null,\n")
  endif()
  if(DEFINED CMAKE_BUILD_TYPE)
    string(APPEND _json "  \"buildType\": \"${CMAKE_BUILD_TYPE}\",\n")
  else()
    string(APPEND _json "  \"buildType\": null,\n")
  endif()
  if(DEFINED CMAKE_CXX_STANDARD)
    string(APPEND _json "  \"cppStd\": ${CMAKE_CXX_STANDARD},\n")
  else()
    string(APPEND _json "  \"cppStd\": null,\n")
  endif()
  if(_STDLIB)
    string(APPEND _json "  \"stdlib\": \"${_STDLIB}\",\n")
  else()
    string(APPEND _json "  \"stdlib\": null,\n")
  endif()
  #   if(_DEP)
  #     string(APPEND _json "  \"deploymentTarget\": \"${_DEP}\",\n")
  #   else()
  #     string(APPEND _json "  \"deploymentTarget\": null,\n")
  #   endif()
  #   # Use common knobs if configured; default to TRUE for CMake unless changed
  if(DEFINED CMAKE_CXX_EXCEPTIONS)
    string(APPEND _json "  \"exceptions\": ${CMAKE_CXX_EXCEPTIONS},\n")
  else()
    string(APPEND _json "  \"exceptions\": true,\n")
  endif()
  if(DEFINED CMAKE_CXX_RTTI)
    string(APPEND _json "  \"rtti\": ${CMAKE_CXX_RTTI},\n")
  else()
    string(APPEND _json "  \"rtti\": true,\n")
  endif()
  if(DEFINED CMAKE_INTERPROCEDURAL_OPTIMIZATION)
    string(APPEND _json "  \"lto\": ${CMAKE_INTERPROCEDURAL_OPTIMIZATION}\n")
  else()
    string(APPEND _json "  \"lto\": false\n")
  endif()
  string(APPEND _json "}\n")

  set(_path "${_dir}/abi.json")
  file(WRITE "${_path}" "${_json}")

  # Compute short hash (first 16 hex of sha256)
  string(SHA256 _sha "${_json}")
  string(SUBSTRING "${_sha}" 0 16 _short)

  set(BUILD_ABI_JSON_PATH "${_path}" CACHE STRING "")
  set(BUILD_ABI_HASH "${_short}" CACHE STRING "")
endfunction()
