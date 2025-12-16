import fs from "node:fs";
import path from "node:path";
import Mustache from "mustache";
import { BuildConfig } from "./config";
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
};

////////////////////////////////////////////////////////////

function toPackageVar(name: string) {
    return name.replace(/[^A-Za-z0-9_]/g, "_");
}

function generateCMakeConfig(input: ConfigInput, templatesDir: string, outputPath: string) {
    const packageVar = toPackageVar(input.packageName);
    const templatePath = path.join(templatesDir, "Config.cmake.mustache");
    const template = fs.readFileSync(templatePath, "utf8");

    // Normalize arrays
    const normalize = <T>(arr?: T[]) => (arr && arr.length ? arr : []);

    const view = {
        packageName: input.packageName,
        version: input.version ?? "0.0.0",
        namespace: input.namespace,
        packageVar,
        extraIncludeDirs: normalize(input.extraIncludeDirs),
        libs: input.libs.map((lib) => ({
            ...lib,
            includeDirs: normalize(lib.includeDirs),
            linkLibraries: normalize(lib.linkLibraries),
            compileDefinitions: normalize(lib.compileDefinitions),
            compileOptions: normalize(lib.compileOptions),
            locations: lib.locations,
        })),
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

export function generate_cmake_config(templatesDir: string, config: BuildConfig, outputPath: string) {
    const libs = config.output.map((lib) => {

        let locations: PerConfigLocations | undefined;
        if (config.code_gen.link_type === "Static") {
            if (config.code_gen.build_type === "Debug") {
                locations = debugStatic(`${lib.path}`);
            } else if (config.code_gen.build_type === "Release") {
                locations = releaseStatic(`${lib.path}`);
            } else {
                locations = singleStatic(`${lib.path}`);
            }
        } else if (config.code_gen.link_type === "Shared") {
            locations = singleShared(`${lib.path}`);
        } else {
            locations = undefined;
        }

        const type: "STATIC" | "SHARED" = config.code_gen.link_type === "Static" ? "STATIC" : "SHARED";

        return ({
            targetName: lib.name,
            type,
            includeDirs: [],
            linkLibraries: [],
            compileDefinitions: [],
            compileOptions: [],
            locations
        });
    });

    const cmakeConfigParams: ConfigInput = {
        packageName: config.name,
        version: config.version,
        namespace: config.namespace,
        extraIncludeDirs: [],
        libs
    };

    generateCMakeConfig(cmakeConfigParams, templatesDir, outputPath);
}