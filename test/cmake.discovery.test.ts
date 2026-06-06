/**
 * Functional tests for CMake library auto-discovery (src/apis/cmake.ts).
 *
 * Builds fixture bundle directories on disk, runs the real
 * generate_cmake_config pipeline (discovery + Mustache template), and asserts
 * on the rendered Config.cmake. Run with: ./run.sh tests
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { generate_cmake_config } from "../src/apis/cmake";
import type { BuildConfig, OSType, ArchType, BuildType, LinkType } from "../src/apis/config";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES = path.join(repoRoot, "templates");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "mimi-test-"));

function makeLibs(preset: string, files: string[]) {
    const dir = path.join(root, "bundles", preset, "contents", "libs");
    fs.mkdirSync(dir, { recursive: true });
    for (const f of files) fs.writeFileSync(path.join(dir, f), "x");
}

function cfg(p: { os: OSType; arch: ArchType; build_type: BuildType; link_type: LinkType }): BuildConfig {
    return {
        rootDir: root, namespace: "deps", name: "pkg", version: "1.0.0",
        paths: { build: { bin_dir: "", lib_dir: "", include_dir: "" } },
        platform: { os: p.os, arch: p.arch },
        code_gen: { build_type: p.build_type, link_type: p.link_type, optimization: "-O3" },
    } as unknown as BuildConfig;
}

function render(config: BuildConfig): string {
    const out = path.join(root, "out.cmake");
    generate_cmake_config(TEMPLATES, config, out);
    return fs.readFileSync(out, "utf8");
}

function reset() {
    fs.rmSync(path.join(root, "bundles"), { recursive: true, force: true });
}

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}  ${detail}`); }
}

let r: string;

// ---- A: macOS static, Release-only (the case already shipping) ----
console.log("A) macOS static, Release-only");
makeLibs("macos-arm64-Release", ["libz.a"]);
r = render(cfg({ os: "macos", arch: "arm64", build_type: "Release", link_type: "Static" }));
check("STATIC target libz", /add_library\(libz STATIC IMPORTED/.test(r));
check("IMPORTED_LOCATION_RELEASE libz.a", /IMPORTED_LOCATION_RELEASE "[^"]*\/libz\.a"/.test(r));
reset();

// ---- B (#1,#2): Debug+Release merge with 'd' postfix, including libzstd ----
console.log("B) Debug+Release merge, d-suffix (libfoo/libzstd)");
makeLibs("macos-arm64-Release", ["libfoo.a", "libzstd.a"]);
makeLibs("macos-arm64-Debug", ["libfood.a", "libzstdd.a"]);
r = render(cfg({ os: "macos", arch: "arm64", build_type: "Release", link_type: "Static" }));
check("#2 canonical (release) name libfoo, not libfood", /add_library\(libfoo STATIC/.test(r) && !/add_library\(libfood/.test(r));
check("#1 libzstd NOT mangled to libzst", /add_library\(libzstd STATIC/.test(r) && !/add_library\(libzst /.test(r));
check("libfoo merged DEBUG(libfood.a) + RELEASE(libfoo.a)", /IMPORTED_LOCATION_DEBUG "[^"]*\/libfood\.a"/.test(r) && /IMPORTED_LOCATION_RELEASE "[^"]*\/libfoo\.a"/.test(r));
check("libzstd merged DEBUG(libzstdd.a) + RELEASE(libzstd.a)", /IMPORTED_LOCATION_DEBUG "[^"]*\/libzstdd\.a"/.test(r) && /IMPORTED_LOCATION_RELEASE "[^"]*\/libzstd\.a"/.test(r));
reset();

// ---- C (#3): versioned .so ----
console.log("C) Linux shared, versioned .so");
makeLibs("linux-x86_64-Release", ["libbar.so.1.2.3"]);
r = render(cfg({ os: "linux", arch: "x86_64", build_type: "Release", link_type: "Shared" }));
check("#3 SHARED target libbar from libbar.so.1.2.3", /add_library\(libbar SHARED IMPORTED/.test(r));
check("#3 IMPORTED_LOCATION_RELEASE -> versioned .so", /IMPORTED_LOCATION_RELEASE "[^"]*\/libbar\.so\.1\.2\.3"/.test(r));
reset();

// ---- D (#4): Windows shared, .dll + .lib import pair ----
console.log("D) Windows shared, .dll + .lib pair");
makeLibs("windows-x86_64-Release", ["glfw3.dll", "glfw3.lib"]);
r = render(cfg({ os: "windows", arch: "x86_64", build_type: "Release", link_type: "Shared" }));
check("#4 single SHARED target glfw3 (not two)", (r.match(/add_library\(glfw3 /g) || []).length === 1 && /add_library\(glfw3 SHARED IMPORTED/.test(r));
check("#4 IMPORTED_LOCATION_RELEASE = glfw3.dll", /IMPORTED_LOCATION_RELEASE "[^"]*\/glfw3\.dll"/.test(r));
check("#4 IMPORTED_IMPLIB_RELEASE = glfw3.lib", /IMPORTED_IMPLIB_RELEASE "[^"]*\/glfw3\.lib"/.test(r));
reset();

// ---- E: Windows static .lib is a STATIC archive, not an import lib ----
console.log("E) Windows static, .lib = STATIC archive");
makeLibs("windows-x86_64-Release", ["zlib.lib"]);
r = render(cfg({ os: "windows", arch: "x86_64", build_type: "Release", link_type: "Static" }));
check("E STATIC target zlib", /add_library\(zlib STATIC IMPORTED/.test(r));
check("E IMPORTED_LOCATION_RELEASE = zlib.lib, no implib", /IMPORTED_LOCATION_RELEASE "[^"]*\/zlib\.lib"/.test(r) && !/IMPORTED_IMPLIB/.test(r));
reset();

// ---- F (#4 template): Windows shared, import-lib only (no .dll bundled) ----
console.log("F) Windows shared, import-lib-only -> implib still emitted");
makeLibs("windows-x86_64-Release", ["mylib.lib"]);
r = render(cfg({ os: "windows", arch: "x86_64", build_type: "Release", link_type: "Shared" }));
check("F SHARED target mylib", /add_library\(mylib SHARED IMPORTED/.test(r));
check("F IMPORTED_IMPLIB_RELEASE emitted without binary", /IMPORTED_IMPLIB_RELEASE "[^"]*\/mylib\.lib"/.test(r));
check("F no empty IMPORTED_LOCATION", !/IMPORTED_LOCATION_RELEASE "[^"]*\/"/.test(r));
reset();

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
fs.rmSync(root, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
