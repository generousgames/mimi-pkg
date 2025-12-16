import path from "path";
import { fs } from "zx";
import { log } from "../utils/log.js";

const BUILD_MANIFEST_FILE = "manifest.json";

export type OSType = "macos" | "ios" | "windows" | "linux";
export type ArchType = "arm64" | "x86_64";
export type BuildType = "Release" | "Debug";
export type OptimizationLevel = "-O0" | "-O1" | "-O2" | "-O3" | "-Os" | "-Oz";
export type Stdlib = "libc++" | "libstdc++";
export type LinkType = "Static" | "Shared";

export type PathsConfig = {
    // The paths to the license files.
    license_files?: string[];
    // The directory to the header files.
    header_dir?: string;
};

export type PlatformConfig = {
    // The operating system.
    os: OSType;

    // The architecture to build for.
    arch: ArchType;
};

export type CompilerConfig = {
    // The C compiler to use.
    c: string;
    // The C++ compiler to use.
    cpp: string;
};

export type LanguageConfig = {
    // The C standard to use.
    c_std: string;
    // The C++ standard to use.
    cpp_std: string;

    // Whether to enable RTTI.
    rtti: boolean;
    // Whether to enable exceptions.
    exceptions: boolean;
};

export type CodeGenConfig = {
    // The build type to use.
    build_type: BuildType;
    // The link type to use.
    link_type: LinkType;
    // The optimization level to use.
    optimization: OptimizationLevel;
};

export type MacOSRuntimeOptions = {
    // The macOS deployment target to use.
    deployment_target: string;
};
export type iOSRuntimeOptions = {
    // The iOS deployment target to use.
    deployment_target: string;
};
export type RuntimeConfig = {
    // The standard library to use.
    stdlib: Stdlib;
} & (MacOSRuntimeOptions | iOSRuntimeOptions);

export type LibOutput = {
    // The name of the library.
    name: string;
    // The path to the library.
    path: string;
};

export type BuildConfig = {
    // The root directory of the repository.
    rootDir: string;

    // The namespace of the dependency.
    namespace: string;

    // The name of the dependency.
    name: string;

    // The version of the dependency.
    version: string;

    // The paths configuration.
    paths: PathsConfig;

    // The platform configuration.
    platform: PlatformConfig;

    // The compiler configuration.
    compiler: CompilerConfig;

    // The language configuration.
    language: LanguageConfig;

    // The code generation configuration.
    code_gen: CodeGenConfig;

    // The runtime configuration.
    runtime: RuntimeConfig;

    // The build output configuration.
    output: LibOutput[];
};

/**
 * Get the preset for the given build configuration.
 * @param config - The build configuration.
 * @returns The preset name.
 */
export function get_preset(config: BuildConfig): string {
    return `${config.platform.os}-${config.platform.arch}-${config.code_gen.build_type}`;
}

/**
 * Load the build configuration from the given root directory.
 * @param root_dir - The root directory of the repository.
 * @param preset - The preset to load.
 * @returns The build configuration.
 */
export function load_build_config(root_dir: string, preset: string): BuildConfig | undefined {
    const manifest = path.join(root_dir, BUILD_MANIFEST_FILE);
    if (!fs.existsSync(manifest)) {
        log.err("Manifest file not found.");
        process.exit(1);
    }
    const manifestJson = JSON.parse(fs.readFileSync(manifest, "utf8"));

    return {
        rootDir: root_dir,
        name: manifestJson.name,
        version: manifestJson.version,
        paths: {
            license_files: manifestJson.license_files ?? [],
            header_dir: manifestJson.header_dir ?? "",
        },
        ...manifestJson.configs[preset],
    }
}

/**
 * Print the build configuration.
 * @param config - The build configuration.
 */
export function print_build_config(config: BuildConfig) {
    log.info(`${config.name}(${config.version})`);
    log.info(`> Preset: ${get_preset(config)}`);
    log.info(`> C Compiler: ${config.compiler.c}`);
    log.info(`> C++ Compiler: ${config.compiler.cpp}`);
    log.info(`> Stdlib: ${config.runtime.stdlib}`);
    log.info(`> C++ Std: ${config.language.cpp_std}`);
    log.info(`> C++ Flags: ${config.code_gen.optimization}`);
    if (config.platform.os === "macos") {
        log.info(`> macOS Deployment Target: ${config.runtime.deployment_target}`);
    }
    if (config.platform.os === "ios") {
        log.info(`> iOS Deployment Target: ${config.runtime.deployment_target}`);
    }
}