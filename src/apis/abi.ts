import { log } from "../utils/log";
import shasum from "shasum";
import { fs } from "zx";

/**
 * Application Binary Interface (ABI) definition.
 */
export type AbiInfo = {
    // The triple (e.g. macos-arm64-clang17).
    triple: string;

    // The operating system.
    os: string;
    // The architecture.
    arch: string;

    // The compiler family.
    compilerFamily: string;

    // The major version of the compiler frontend.
    compilerFrontendMajor: number;

    // The build type (e.g. Debug, Release).
    buildType: string;

    // The standard library (e.g. libc++, libstdc++).
    stdlib: string;

    // The C++ standard (e.g. c++20, c++17, c++11, etc.).
    cppStd: number;
};

/**
 * Generate ABI information from the given path.
 * @param path - The path to the ABI JSON file.
 * @returns The ABI information.
 */
export function generate_abi_from_path(path: string): AbiInfo {
    const abiJSON = JSON.parse(fs.readFileSync(path, "utf8"));
    return {
        triple: abiJSON.triple,
        os: abiJSON.os,
        arch: abiJSON.arch,
        compilerFamily: abiJSON.compilerFamily,
        compilerFrontendMajor: abiJSON.compilerFrontendMajor,
        buildType: abiJSON.buildType,
        stdlib: abiJSON.stdlib,
        cppStd: abiJSON.cppStd,
    } as AbiInfo;
}

/**
 * Generate an ABI fingerprint from the given ABI information.
 * @param abi_info - The ABI information.
 * @returns The ABI fingerprint.
 */
function generate_abi_fingerprint(abi_info: AbiInfo) {
    const { os, arch, compilerFamily, compilerFrontendMajor, buildType, stdlib, cppStd } = abi_info;
    return `${os}|${arch}|${compilerFamily}|${compilerFrontendMajor}|${buildType}|${stdlib}|${cppStd}`;
}

/**
 * Generate an ABI hash from the given ABI information.
 * @param abi_info - The ABI information.
 * @returns The ABI hash.
 */
export function generate_abi_hash(abi_info: AbiInfo) {
    const fingerprint = generate_abi_fingerprint(abi_info);
    return shasum(fingerprint);
}

/**
 * Generate an ABI short hash from the given ABI information.
 * @param abi_info - The ABI information.
 * @param bytes - The number of bytes to include in the short hash.
 * @returns The ABI short hash.
 */
export function generate_abi_short_hash(abi_info: AbiInfo, bytes: number = 8) {
    return generate_abi_hash(abi_info).slice(0, bytes);
}

/**
 * Print the ABI information to the console.
 * @param abi_info - The ABI information.
 */
export function print_abi_info(abi_info: AbiInfo) {
    const fingerprint = generate_abi_fingerprint(abi_info);
    const abi_hash = generate_abi_hash(abi_info);

    log.info(`ABI`);
    log.info(`> Triple: ${abi_info.triple}`);
    log.info(`> Fingerprint: ${fingerprint}`);
    log.info(`> Hash: ${abi_hash}`);
}