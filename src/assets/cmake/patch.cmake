# cmake/patch.cmake
cmake_minimum_required(VERSION 3.27)

# Compatible with CMake versions before/after 3.19 (no JSON PARSE used).
# Assumes you've already included your env/prebuild file so BUILD_OS/BUILD_ARCH exist

# ---- safety & setup ----------------------------------------------------------
if(NOT DEFINED MANIFEST_FILE)
    message(FATAL_ERROR "patch.cmake: MANIFEST_FILE must be set before include().")
endif()
if(NOT EXISTS "${MANIFEST_FILE}")
    message(FATAL_ERROR "patch.cmake: MANIFEST_FILE does not exist: ${MANIFEST_FILE}")
endif()

# ---- tiny JSON helpers (no PARSE) -------------------------------------------
# json_get(<out> <json> <path...>) -> returns "" on missing key
function(json_get out json)
    if("${ARGC}" LESS 3)
        message(FATAL_ERROR "json_get(out, json, path...) requires at least one key")
    endif()
    set(_cur "${json}")
    foreach(_k IN LISTS ARGN)
        string(JSON _next ERROR_VARIABLE _err GET "${_cur}" "${_k}")
        if(_err)
            set(_cur "")
            break()
        endif()
        set(_cur "${_next}")
    endforeach()
    set(${out} "${_cur}" PARENT_SCOPE)
endfunction()

# json_to_bool(<out> <value>) -> ON/OFF (accepts true/false/ON/OFF/1/0, case-insensitive)
function(json_to_bool out val)
    string(TOLOWER "${val}" _v)
    if(_v STREQUAL "true" OR _v STREQUAL "on" OR _v STREQUAL "1")
        set(${out} ON PARENT_SCOPE)
    elseif(_v STREQUAL "false" OR _v STREQUAL "off" OR _v STREQUAL "0")
        set(${out} OFF PARENT_SCOPE)
    else()
        # Empty or unknown -> empty
        set(${out} "" PARENT_SCOPE)
    endif()
endfunction()

# ---- read manifest & select config ------------------------------------------
file(READ "${MANIFEST_FILE}" _mf_raw)

# Determine BuildType at *configure* time (multi-config IDEs will still build per-config)
set(_bt "${CMAKE_BUILD_TYPE}")
if(NOT _bt OR _bt STREQUAL "")
    if(CMAKE_CONFIGURATION_TYPES)
        set(_bt "Release")
    else()
        set(_bt "Release")
    endif()
endif()

# Fall back if env layer wasn’t included
if(NOT DEFINED BUILD_OS OR NOT DEFINED BUILD_ARCH)
    message(FATAL_ERROR "patch.cmake: BUILD_OS and BUILD_ARCH must be set before include().")
endif()

# Allow override of the manifest key that we pick
if(NOT DEFINED BUILD_CONFIG_KEY OR BUILD_CONFIG_KEY STREQUAL "")
    set(BUILD_CONFIG_KEY "${BUILD_OS}-${BUILD_ARCH}-${_bt}")
endif()

# Fetch configs and chosen config object
json_get(_configs "${_mf_raw}" configs)
if(_configs STREQUAL "")
    message(FATAL_ERROR "patch.cmake: manifest.json has no 'configs' object")
endif()

json_get(_cfg "${_configs}" "${BUILD_CONFIG_KEY}")
if(_cfg STREQUAL "")
    message(FATAL_ERROR "patch.cmake: config '${BUILD_CONFIG_KEY}' not found.")
endif()

# ---- extract sections/fields -------------------------------------------------
json_get(_language "${_cfg}" language)
json_get(_runtime "${_cfg}" runtime)
json_get(_codegen "${_cfg}" code_gen)

json_get(MF_CPP_STD "${_language}" cpp_std) # e.g. "c++20"
json_get(MF_C_STD "${_language}" c_std) # e.g. "c17"
json_get(MF_RTTI "${_language}" rtti) # true|false
json_get(MF_EXCEPT "${_language}" exceptions) # true|false

json_get(MF_STDLIB "${_runtime}" stdlib) # "libc++"|"libstdc++"|"msvc"
json_get(MF_DEPLOY "${_runtime}" deployment_target) # e.g. "12.0" (macOS)

json_get(MF_LINK "${_codegen}" link_type) # "Static"|"Dynamic"
json_get(MF_OPT "${_codegen}" optimization) # "-O3"|"-O0"|...

# Top-level options (not per-config)
json_get(_options "${_mf_raw}" options) # object or ""
json_get(MF_BSL_RAW "${_options}" BUILD_SHARED_LIBS)

# ---- compiler family flags ---------------------------------------------------
set(_is_msvc FALSE)
set(_is_clanglike FALSE)
set(_is_gcc FALSE)
if(CMAKE_CXX_COMPILER_ID STREQUAL "MSVC")
    set(_is_msvc TRUE)
elseif(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
    set(_is_clanglike TRUE)
elseif(CMAKE_CXX_COMPILER_ID STREQUAL "GNU")
    set(_is_gcc TRUE)
endif()

set(_cxx_opts "")
set(_link_opts "")

# ---- language: standards -----------------------------------------------------
# Map "c++20" -> 20; "c17" -> 17, etc.
if(MF_CPP_STD)
    string(REGEX MATCH "([0-9]+)$" _cpp_std_num "${MF_CPP_STD}")
    if(_cpp_std_num)
        set(CMAKE_CXX_STANDARD "${_cpp_std_num}" CACHE STRING "C++ standard from manifest" FORCE)
        set(CMAKE_CXX_STANDARD_REQUIRED ON CACHE BOOL "" FORCE)
        set(CMAKE_CXX_EXTENSIONS OFF CACHE BOOL "" FORCE)
    endif()
endif()
if(MF_C_STD)
    string(REGEX MATCH "([0-9]+)$" _c_std_num "${MF_C_STD}")
    if(_c_std_num)
        set(CMAKE_C_STANDARD "${_c_std_num}" CACHE STRING "C standard from manifest" FORCE)
        set(CMAKE_C_STANDARD_REQUIRED ON CACHE BOOL "" FORCE)
    endif()
endif()

# ---- language: RTTI / Exceptions --------------------------------------------
# RTTI
json_to_bool(_rtti_on "${MF_RTTI}")
if(_rtti_on STREQUAL "ON")
    if(_is_msvc)
        list(APPEND _cxx_opts "/GR")
    else()
        list(APPEND _cxx_opts "-frtti")
    endif()
elseif(_rtti_on STREQUAL "OFF")
    if(_is_msvc)
        list(APPEND _cxx_opts "/GR-")
    else()
        list(APPEND _cxx_opts "-fno-rtti")
    endif()
endif()

# Exceptions
json_to_bool(_exc_on "${MF_EXCEPT}")
if(_exc_on STREQUAL "ON")
    if(_is_msvc)
        list(APPEND _cxx_opts "/EHsc")
    else()
        list(APPEND _cxx_opts "-fexceptions")
    endif()
elseif(_exc_on STREQUAL "OFF")
    if(_is_msvc)
        # No single global "off" for MSVC; omit /EHsc and enforce by policy/testing.
    else()
        list(APPEND _cxx_opts "-fno-exceptions")
    endif()
endif()

# ---- runtime: stdlib + deployment target ------------------------------------
if(MF_STDLIB AND _is_clanglike AND NOT _is_msvc)
    if(MF_STDLIB STREQUAL "libc++")
        list(APPEND _cxx_opts "-stdlib=libc++")
    elseif(MF_STDLIB STREQUAL "libstdc++")
        list(APPEND _cxx_opts "-stdlib=libstdc++")
    endif()
endif()

if(APPLE AND MF_DEPLOY)
    set(CMAKE_OSX_DEPLOYMENT_TARGET "${MF_DEPLOY}" CACHE STRING "" FORCE)
endif()

# ---- code_gen: link_type + optimization -------------------------------------
# link_type provides a default for BUILD_SHARED_LIBS if top-level option absent
if(MF_LINK STREQUAL "Static")
    set(_mf_default_shared OFF)
elseif(MF_LINK STREQUAL "Dynamic")
    set(_mf_default_shared ON)
endif()

if(MF_OPT)
    list(APPEND _cxx_opts "${MF_OPT}")
endif()

# ---- options: BUILD_SHARED_LIBS (top-level) ---------------------------------
if(DEFINED MF_BSL_RAW AND NOT MF_BSL_RAW STREQUAL "")
    json_to_bool(_bsl "${MF_BSL_RAW}")
    if(NOT _bsl STREQUAL "")
        set(BUILD_SHARED_LIBS ${_bsl} CACHE BOOL "" FORCE)
    endif()
elseif(DEFINED _mf_default_shared)
    set(BUILD_SHARED_LIBS ${_mf_default_shared} CACHE BOOL "" FORCE)
endif()

# ---- (optional) make these directory defaults instead of opt-in -------------
# Uncomment if you want *everything* under this directory to pick the flags
message(STATUS "Applying compiler options: ${_cxx_opts}")
message(STATUS "Applying link options: ${_link_opts}")
add_compile_options(${_cxx_opts})
add_link_options(${_link_opts})