/**
 * Tests for CMake library auto-discovery (src/apis/cmake.ts).
 *
 * Builds fixture bundle directories on disk, runs the real
 * generate_cmake_config pipeline (discovery + Mustache template), and asserts
 * on the rendered Config.cmake. Run with: ./run.sh tests
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { generate_cmake_config } from "../src/apis/cmake";
import type { BuildConfig, OSType, ArchType, BuildType, LinkType } from "../src/apis/config";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES = path.join(repoRoot, "templates");

let root: string;

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

describe("cmake auto-discovery", () => {
    before(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "mimi-test-")); });
    after(() => { fs.rmSync(root, { recursive: true, force: true }); });
    beforeEach(() => { fs.rmSync(path.join(root, "bundles"), { recursive: true, force: true }); });

    it("macOS static, Release-only -> STATIC target with release location", () => {
        makeLibs("macos-arm64-Release", ["libz.a"]);
        const r = render(cfg({ os: "macos", arch: "arm64", build_type: "Release", link_type: "Static" }));
        assert.match(r, /add_library\(libz STATIC IMPORTED/);
        assert.match(r, /IMPORTED_LOCATION_RELEASE "[^"]*\/libz\.a"/);
    });

    describe("Debug/Release merge with debug postfix (#1, #2)", () => {
        beforeEach(() => {
            makeLibs("macos-arm64-Release", ["libfoo.a", "libzstd.a"]);
            makeLibs("macos-arm64-Debug", ["libfood.a", "libzstdd.a"]);
        });

        it("#2 merged target takes the canonical Release name, not the debug-suffixed one", () => {
            const r = render(cfg({ os: "macos", arch: "arm64", build_type: "Release", link_type: "Static" }));
            assert.match(r, /add_library\(libfoo STATIC/);
            assert.doesNotMatch(r, /add_library\(libfood/);
        });

        it("#1 a library legitimately ending in 'd' (libzstd) is not mangled", () => {
            const r = render(cfg({ os: "macos", arch: "arm64", build_type: "Release", link_type: "Static" }));
            assert.match(r, /add_library\(libzstd STATIC/);
            assert.doesNotMatch(r, /add_library\(libzst /);
        });

        it("merges debug + release files into one target's per-config locations", () => {
            const r = render(cfg({ os: "macos", arch: "arm64", build_type: "Release", link_type: "Static" }));
            assert.match(r, /IMPORTED_LOCATION_DEBUG "[^"]*\/libfood\.a"/);
            assert.match(r, /IMPORTED_LOCATION_RELEASE "[^"]*\/libfoo\.a"/);
            assert.match(r, /IMPORTED_LOCATION_DEBUG "[^"]*\/libzstdd\.a"/);
            assert.match(r, /IMPORTED_LOCATION_RELEASE "[^"]*\/libzstd\.a"/);
        });
    });

    it("#3 recognizes versioned shared objects (libbar.so.1.2.3)", () => {
        makeLibs("linux-x86_64-Release", ["libbar.so.1.2.3"]);
        const r = render(cfg({ os: "linux", arch: "x86_64", build_type: "Release", link_type: "Shared" }));
        assert.match(r, /add_library\(libbar SHARED IMPORTED/);
        assert.match(r, /IMPORTED_LOCATION_RELEASE "[^"]*\/libbar\.so\.1\.2\.3"/);
    });

    it("#4 Windows shared: pairs .dll + .lib into one SHARED target", () => {
        makeLibs("windows-x86_64-Release", ["glfw3.dll", "glfw3.lib"]);
        const r = render(cfg({ os: "windows", arch: "x86_64", build_type: "Release", link_type: "Shared" }));
        assert.equal((r.match(/add_library\(glfw3 /g) || []).length, 1);
        assert.match(r, /add_library\(glfw3 SHARED IMPORTED/);
        assert.match(r, /IMPORTED_LOCATION_RELEASE "[^"]*\/glfw3\.dll"/);
        assert.match(r, /IMPORTED_IMPLIB_RELEASE "[^"]*\/glfw3\.lib"/);
    });

    it("Windows static: .lib is a STATIC archive, not an import library", () => {
        makeLibs("windows-x86_64-Release", ["zlib.lib"]);
        const r = render(cfg({ os: "windows", arch: "x86_64", build_type: "Release", link_type: "Static" }));
        assert.match(r, /add_library\(zlib STATIC IMPORTED/);
        assert.match(r, /IMPORTED_LOCATION_RELEASE "[^"]*\/zlib\.lib"/);
        assert.doesNotMatch(r, /IMPORTED_IMPLIB/);
    });

    it("#4 Windows shared, import-lib only (no .dll): still emits IMPORTED_IMPLIB", () => {
        makeLibs("windows-x86_64-Release", ["mylib.lib"]);
        const r = render(cfg({ os: "windows", arch: "x86_64", build_type: "Release", link_type: "Shared" }));
        assert.match(r, /add_library\(mylib SHARED IMPORTED/);
        assert.match(r, /IMPORTED_IMPLIB_RELEASE "[^"]*\/mylib\.lib"/);
        assert.doesNotMatch(r, /IMPORTED_LOCATION_RELEASE "[^"]*\/"/); // no empty location
    });
});
