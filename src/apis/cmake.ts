import fs from "node:fs";
import path from "node:path";
import Mustache from "mustache";
import { BuildConfig, get_preset } from "./config";
import { log } from "../utils/log";

type LibLocation = {
    /** Full path to the runtime/binary (.a/.so/.dylib/.dll) */
    binary: string;
    /** Windows: optional .lib import library for a DLL */
    implib?: string | null;
};

type PerConfigLocations = {
    SINGLE?: LibLocation;      // use when you only ship one config
    DEBUG?: LibLocation;       // optional
    RELEASE?: LibLocation;     // optional
};

type LibSpec = {
    /** Logical target name WITHOUT namespace (e.g., "glfw") */
    targetName: string;
    /** "STATIC" | "SHARED" */
    type: "STATIC" | "SHARED";
    /** Extra include dirs relative to bundle root (or absolute) */
    includeDirs?: string[];
    /**
     * Transitive link libraries. Provide CMake-ready items:
     *   - other imported targets: "pkg::lib"
     *   - system libs: "z"
     *   - frameworks: "$<$<PLATFORM_ID:Darwin>:Cocoa>"
     *   - packages: "Threads::Threads", "OpenGL::GL", etc.
     */
    linkLibraries?: string[];
    compileDefinitions?: string[];
    compileOptions?: string[];
    /** Map of SINGLE / DEBUG / RELEASE to file locations */
    locations?: PerConfigLocations;
};

type ConfigInput = {
    packageName: string;          // e.g., "glfw"
    namespace?: string;           // optional
    version?: string;             // optional
    /** Extra include dirs at package level (relative or absolute) */
    extraIncludeDirs?: string[];
    /** libs to export */
    libs: LibSpec[];
    /** Interface target name (e.g., "deps::zlib") */
    interfaceTargetName?: string;
};

////////////////////////////////////////////////////////////

function toPackageVar(name: string) {
    return name.replace(/[^A-Za-z0-9_]/g, "_");
}

/**
 * Library file extensions to scan for
 */
const LIBRARY_EXTENSIONS = [".a", ".so", ".dylib", ".lib", ".dll"];

/**
 * Check if a file is a library based on its extension
 */
function isLibraryFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return LIBRARY_EXTENSIONS.includes(ext);
}

/**
 * Determine if a library is static or shared based on extension
 */
function getLibraryType(filename: string): "STATIC" | "SHARED" {
    const ext = path.extname(filename).toLowerCase();
    // Static libraries: .a, .lib
    // Shared libraries: .so, .dylib, .dll
    if (ext === ".a" || ext === ".lib") {
        return "STATIC";
    }
    return "SHARED";
}

/**
 * Normalize library name for matching (remove trailing 'd' for Debug suffix matching)
 */
function normalizeLibraryName(filename: string): string {
    const nameWithoutExt = path.basename(filename, path.extname(filename));
    // Remove trailing 'd' if present (common Debug suffix)
    if (nameWithoutExt.endsWith("d") && nameWithoutExt.length > 1) {
        return nameWithoutExt.slice(0, -1);
    }
    return nameWithoutExt;
}

/**
 * Recursively find all library files in a directory
 */
function findLibraryFiles(dir: string, baseDir: string = dir): string[] {
    const files: string[] = [];
    
    if (!fs.existsSync(dir)) {
        return files;
    }
    
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            // Recursively search subdirectories
            files.push(...findLibraryFiles(fullPath, baseDir));
        } else if (entry.isFile() && isLibraryFile(entry.name)) {
            // Return path relative to baseDir
            const relativePath = path.relative(baseDir, fullPath);
            files.push(relativePath);
        }
    }
    
    return files;
}

/**
 * Discover libraries from bundle libs directories
 */
function discoverLibraries(
    rootDir: string,
    debugPreset: string | null,
    releasePreset: string | null
): LibSpec[] {
    const libraries = new Map<string, LibSpec>();

    // Scan Debug bundle if it exists
    if (debugPreset) {
        const debugLibsDir = path.join(rootDir, "bundles", debugPreset, "contents", "libs");
        if (fs.existsSync(debugLibsDir)) {
            const files = findLibraryFiles(debugLibsDir);
            for (const file of files) {
                const filename = path.basename(file);
                const targetName = path.basename(file, path.extname(filename));
                const normalized = normalizeLibraryName(filename);
                
                let lib = libraries.get(normalized);
                if (!lib) {
                    lib = {
                        targetName: targetName,
                        type: getLibraryType(filename),
                        includeDirs: [],
                        linkLibraries: [],
                        compileDefinitions: [],
                        compileOptions: [],
                        locations: {},
                    };
                    libraries.set(normalized, lib);
                }
                if (!lib.locations) {
                    lib.locations = {};
                }
                lib.locations.DEBUG = { binary: file };
            }
        }
    }

    // Scan Release bundle if it exists
    if (releasePreset) {
        const releaseLibsDir = path.join(rootDir, "bundles", releasePreset, "contents", "libs");
        if (fs.existsSync(releaseLibsDir)) {
            const files = findLibraryFiles(releaseLibsDir);
            for (const file of files) {
                const filename = path.basename(file);
                const targetName = path.basename(file, path.extname(filename));
                const normalized = normalizeLibraryName(filename);
                
                let lib = libraries.get(normalized);
                if (!lib) {
                    lib = {
                        targetName: targetName,
                        type: getLibraryType(filename),
                        includeDirs: [],
                        linkLibraries: [],
                        compileDefinitions: [],
                        compileOptions: [],
                        locations: {},
                    };
                    libraries.set(normalized, lib);
                } else {
                    // Use Release target name if Debug doesn't exist
                    if (!lib.locations?.DEBUG) {
                        lib.targetName = targetName;
                    }
                }
                if (!lib.locations) {
                    lib.locations = {};
                }
                lib.locations.RELEASE = { binary: file };
            }
        }
    }

    // Filter out libraries with no locations and clean up empty locations
    return Array.from(libraries.values())
        .map(lib => ({
            ...lib,
            locations: lib.locations && Object.keys(lib.locations).length > 0 
                ? lib.locations 
                : undefined,
        }))
        .filter(lib => lib.locations !== undefined);
}

function generateCMakeConfig(input: ConfigInput, templatesDir: string, outputPath: string) {
    const packageVar = toPackageVar(input.packageName);
    const templatePath = path.join(templatesDir, "Config.cmake.mustache");
    const template = fs.readFileSync(templatePath, "utf8");

    // Normalize arrays
    const normalize = <T>(arr?: T[]) => (arr && arr.length ? arr : []);

    const libsWithMeta = input.libs.map((lib, index) => ({
        ...lib,
        includeDirs: normalize(lib.includeDirs),
        linkLibraries: normalize(lib.linkLibraries),
        compileDefinitions: normalize(lib.compileDefinitions),
        compileOptions: normalize(lib.compileOptions),
        locations: lib.locations,
        last: index === input.libs.length - 1,
    }));

    const view = {
        packageName: input.packageName,
        version: input.version ?? "0.0.0",
        namespace: input.namespace,
        packageVar,
        extraIncludeDirs: normalize(input.extraIncludeDirs),
        libs: libsWithMeta,
        interfaceTargetName: input.interfaceTargetName,
    };

    const rendered = Mustache.render(template, view);
    fs.writeFileSync(outputPath, rendered, "utf8");
}

////////////////////////////////////////////////////////////

function singleStatic(libPath: string): PerConfigLocations {
    return { SINGLE: { binary: libPath } };
}
function debugStatic(libPath: string): PerConfigLocations {
    return { DEBUG: { binary: libPath } };
}
function releaseStatic(libPath: string): PerConfigLocations {
    return { RELEASE: { binary: libPath } };
}

function singleShared(
    libPath: string,
    implibDir?: string,
    implibName?: string
): PerConfigLocations {
    return {
        SINGLE: {
            binary: libPath,
            implib: implibDir && implibName ? path.join(implibDir, implibName) : null,
        },
    };
}

function perConfig(
    libOrBinDir: { debug: string; release: string },
    filenames: {
        debug: { binary: string; implib?: string | null };
        release: { binary: string; implib?: string | null };
    }
): PerConfigLocations {
    return {
        DEBUG: {
            binary: path.join(libOrBinDir.debug, filenames.debug.binary),
            implib: filenames.debug.implib
                ? path.join(libOrBinDir.debug, filenames.debug.implib)
                : null,
        },
        RELEASE: {
            binary: path.join(libOrBinDir.release, filenames.release.binary),
            implib: filenames.release.implib
                ? path.join(libOrBinDir.release, filenames.release.implib)
                : null,
        },
    };
}

////////////////////////////////////////////////////////////

export function generate_cmake_config(
    templatesDir: string,
    config: BuildConfig,
    outputPath: string
) {
    // Determine Debug and Release presets
    const currentPreset = get_preset(config);
    const isDebug = config.code_gen.build_type === "Debug";
    const isRelease = config.code_gen.build_type === "Release";
    
    let debugPreset: string | null = null;
    let releasePreset: string | null = null;
    
    if (isDebug) {
        debugPreset = currentPreset;
        // Try to find Release preset
        const releasePresetName = currentPreset.replace("-Debug", "-Release");
        const releaseLibsDir = path.join(config.rootDir, "bundles", releasePresetName, "contents", "libs");
        if (fs.existsSync(releaseLibsDir)) {
            releasePreset = releasePresetName;
        }
    } else if (isRelease) {
        releasePreset = currentPreset;
        // Try to find Debug preset
        const debugPresetName = currentPreset.replace("-Release", "-Debug");
        const debugLibsDir = path.join(config.rootDir, "bundles", debugPresetName, "contents", "libs");
        if (fs.existsSync(debugLibsDir)) {
            debugPreset = debugPresetName;
        }
    }

    // Discover libraries from bundle directories
    const libs = discoverLibraries(config.rootDir, debugPreset, releasePreset);

    // Generate interface target name: {namespace}::{packageName}
    const interfaceTargetName = config.namespace 
        ? `${config.namespace}::${config.name}`
        : config.name;

    const cmakeConfigParams: ConfigInput = {
        packageName: config.name,
        version: config.version,
        namespace: config.namespace,
        extraIncludeDirs: [],
        libs,
        interfaceTargetName,
    };

    generateCMakeConfig(cmakeConfigParams, templatesDir, outputPath);
}