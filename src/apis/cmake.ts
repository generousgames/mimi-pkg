import fs from "node:fs";
import path from "node:path";
import Mustache from "mustache";
import { BuildConfig, LinkType, get_preset } from "./config";
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
 * Check if a file is a library we should export. Recognizes static archives
 * (.a/.lib), shared libraries (.dylib/.dll) and versioned shared objects
 * (libfoo.so, libfoo.so.1, libfoo.so.1.2.3).
 */
function isLibraryFile(filename: string): boolean {
    const lower = filename.toLowerCase();
    if (/\.so(\.\d+)*$/.test(lower)) return true;
    return [".a", ".lib", ".dylib", ".dll"].includes(path.extname(lower));
}

type LibRole = "binary" | "implib";
type ParsedLib = { base: string; role: LibRole; type: "STATIC" | "SHARED" };

/**
 * Parse a library filename into its logical base name, role and link type.
 *
 * `linkType` disambiguates Windows `.lib`, which is a static archive for a
 * Static build but a DLL *import library* for a Shared build — guessing from
 * the extension alone classifies every import lib as static, which is wrong.
 * Returns null for files that aren't libraries.
 */
function parseLibFile(filename: string, linkType: LinkType): ParsedLib | null {
    const lower = filename.toLowerCase();

    // Versioned/unversioned shared objects: libfoo.so, libfoo.so.1.2.3
    const soMatch = lower.match(/^(.*)\.so(?:\.\d+)*$/);
    if (soMatch) {
        return { base: filename.slice(0, soMatch[1].length), role: "binary", type: "SHARED" };
    }

    const ext = path.extname(lower);
    const base = filename.slice(0, filename.length - path.extname(filename).length);
    switch (ext) {
        case ".a":
            return { base, role: "binary", type: "STATIC" };
        case ".dylib":
        case ".dll":
            return { base, role: "binary", type: "SHARED" };
        case ".lib":
            return linkType === "Shared"
                ? { base, role: "implib", type: "SHARED" }
                : { base, role: "binary", type: "STATIC" };
        default:
            return null;
    }
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

/** A single config's library, with a DLL paired to its import lib (Windows). */
type Artifact = { type: "STATIC" | "SHARED"; binary?: string; implib?: string };

/**
 * Group one bundle's library files into logical artifacts keyed by base name.
 * A `.dll` and its matching `.lib` import library collapse into one SHARED
 * artifact (binary = .dll, implib = .lib).
 */
function groupArtifacts(files: string[], linkType: LinkType): Map<string, Artifact> {
    const artifacts = new Map<string, Artifact>();
    for (const file of files) {
        const parsed = parseLibFile(path.basename(file), linkType);
        if (!parsed) continue;
        const art = artifacts.get(parsed.base) ?? { type: parsed.type };
        if (parsed.role === "implib") {
            art.implib = file;
            art.type = "SHARED"; // an import library always implies a shared target
        } else {
            art.binary = file;
            if (parsed.type === "SHARED") art.type = "SHARED";
        }
        artifacts.set(parsed.base, art);
    }
    return artifacts;
}

/** Debug postfixes to try when matching a Debug lib to its Release counterpart. */
const DEBUG_POSTFIXES = ["d", "_d", "-d"];

/**
 * Discover libraries from bundle libs directories, merging the Debug and
 * Release variants of each library into a single per-config IMPORTED target.
 *
 * Release names are treated as canonical, so a library whose name legitimately
 * ends in "d" (e.g. libzstd) is never mangled. A Debug library is matched to
 * its Release counterpart by exact name first, then by stripping a known
 * CMAKE_DEBUG_POSTFIX (d / _d / -d).
 */
function discoverLibraries(
    rootDir: string,
    debugPreset: string | null,
    releasePreset: string | null,
    linkType: LinkType
): LibSpec[] {
    const libsDir = (preset: string) =>
        path.join(rootDir, "bundles", preset, "contents", "libs");

    const debugArtifacts = debugPreset
        ? groupArtifacts(findLibraryFiles(libsDir(debugPreset)), linkType)
        : new Map<string, Artifact>();
    const releaseArtifacts = releasePreset
        ? groupArtifacts(findLibraryFiles(libsDir(releasePreset)), linkType)
        : new Map<string, Artifact>();

    const targets = new Map<string, LibSpec>();

    const upsert = (name: string, art: Artifact, cfg: "DEBUG" | "RELEASE") => {
        let spec = targets.get(name);
        if (!spec) {
            spec = {
                targetName: name,
                type: art.type,
                includeDirs: [],
                linkLibraries: [],
                compileDefinitions: [],
                compileOptions: [],
                locations: {},
            };
            targets.set(name, spec);
        }
        // A shared classification in any config wins (import libs imply shared).
        if (art.type === "SHARED") spec.type = "SHARED";
        spec.locations![cfg] = { binary: art.binary ?? "", implib: art.implib ?? null };
    };

    // Release names are canonical.
    for (const [base, art] of releaseArtifacts) {
        upsert(base, art, "RELEASE");
    }

    // Match Debug libs onto the canonical (Release) name where possible.
    for (const [base, art] of debugArtifacts) {
        let canonical = base;
        if (!releaseArtifacts.has(base)) {
            for (const sfx of DEBUG_POSTFIXES) {
                if (base.length > sfx.length && base.endsWith(sfx)) {
                    const stripped = base.slice(0, base.length - sfx.length);
                    if (releaseArtifacts.has(stripped)) {
                        canonical = stripped;
                        break;
                    }
                }
            }
        }
        upsert(canonical, art, "DEBUG");
    }

    return Array.from(targets.values()).filter(
        (lib) => lib.locations && Object.keys(lib.locations).length > 0
    );
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
    const libs = discoverLibraries(config.rootDir, debugPreset, releasePreset, config.code_gen.link_type);

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