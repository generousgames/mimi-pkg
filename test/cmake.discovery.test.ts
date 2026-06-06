/**
 * Tests for CMake library auto-discovery (src/apis/cmake.ts).
 *
 * Builds fixture bundle directories on disk, runs the real
 * generate_cmake_config pipeline (discovery + Mustache template), and asserts
 * on the rendered Config.cmake. Run with: ./run.sh tests
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { tempWorkspace, type Workspace } from "./helpers";

describe("cmake auto-discovery", () => {
    let ws: Workspace;
    before(() => { ws = tempWorkspace(); });
    after(() => { ws.cleanup(); });
    beforeEach(() => { ws.reset(); });

    it("macOS static, Release-only -> STATIC target with release location", () => {
        ws.makeLibs("macos-arm64-Release", ["libz.a"]);
        const r = ws.render(ws.cfg({ os: "macos", arch: "arm64", build_type: "Release", link_type: "Static" }));
        assert.match(r, /add_library\(libz STATIC IMPORTED/);
        assert.match(r, /IMPORTED_LOCATION_RELEASE "[^"]*\/libz\.a"/);
    });

    describe("Debug/Release merge with debug postfix (#1, #2)", () => {
        beforeEach(() => {
            ws.makeLibs("macos-arm64-Release", ["libfoo.a", "libzstd.a"]);
            ws.makeLibs("macos-arm64-Debug", ["libfood.a", "libzstdd.a"]);
        });

        it("#2 merged target takes the canonical Release name, not the debug-suffixed one", () => {
            const r = ws.render(ws.cfg({ os: "macos", arch: "arm64", build_type: "Release", link_type: "Static" }));
            assert.match(r, /add_library\(libfoo STATIC/);
            assert.doesNotMatch(r, /add_library\(libfood/);
        });

        it("#1 a library legitimately ending in 'd' (libzstd) is not mangled", () => {
            const r = ws.render(ws.cfg({ os: "macos", arch: "arm64", build_type: "Release", link_type: "Static" }));
            assert.match(r, /add_library\(libzstd STATIC/);
            assert.doesNotMatch(r, /add_library\(libzst /);
        });

        it("merges debug + release files into one target's per-config locations", () => {
            const r = ws.render(ws.cfg({ os: "macos", arch: "arm64", build_type: "Release", link_type: "Static" }));
            assert.match(r, /IMPORTED_LOCATION_DEBUG "[^"]*\/libfood\.a"/);
            assert.match(r, /IMPORTED_LOCATION_RELEASE "[^"]*\/libfoo\.a"/);
            assert.match(r, /IMPORTED_LOCATION_DEBUG "[^"]*\/libzstdd\.a"/);
            assert.match(r, /IMPORTED_LOCATION_RELEASE "[^"]*\/libzstd\.a"/);
        });
    });

    it("#3 recognizes versioned shared objects (libbar.so.1.2.3)", () => {
        ws.makeLibs("linux-x86_64-Release", ["libbar.so.1.2.3"]);
        const r = ws.render(ws.cfg({ os: "linux", arch: "x86_64", build_type: "Release", link_type: "Shared" }));
        assert.match(r, /add_library\(libbar SHARED IMPORTED/);
        assert.match(r, /IMPORTED_LOCATION_RELEASE "[^"]*\/libbar\.so\.1\.2\.3"/);
    });

    it("#4 Windows shared: pairs .dll + .lib into one SHARED target", () => {
        ws.makeLibs("windows-x86_64-Release", ["glfw3.dll", "glfw3.lib"]);
        const r = ws.render(ws.cfg({ os: "windows", arch: "x86_64", build_type: "Release", link_type: "Shared" }));
        assert.equal((r.match(/add_library\(glfw3 /g) || []).length, 1);
        assert.match(r, /add_library\(glfw3 SHARED IMPORTED/);
        assert.match(r, /IMPORTED_LOCATION_RELEASE "[^"]*\/glfw3\.dll"/);
        assert.match(r, /IMPORTED_IMPLIB_RELEASE "[^"]*\/glfw3\.lib"/);
    });

    it("Windows static: .lib is a STATIC archive, not an import library", () => {
        ws.makeLibs("windows-x86_64-Release", ["zlib.lib"]);
        const r = ws.render(ws.cfg({ os: "windows", arch: "x86_64", build_type: "Release", link_type: "Static" }));
        assert.match(r, /add_library\(zlib STATIC IMPORTED/);
        assert.match(r, /IMPORTED_LOCATION_RELEASE "[^"]*\/zlib\.lib"/);
        assert.doesNotMatch(r, /IMPORTED_IMPLIB/);
    });

    it("#4 Windows shared, import-lib only (no .dll): still emits IMPORTED_IMPLIB", () => {
        ws.makeLibs("windows-x86_64-Release", ["mylib.lib"]);
        const r = ws.render(ws.cfg({ os: "windows", arch: "x86_64", build_type: "Release", link_type: "Shared" }));
        assert.match(r, /add_library\(mylib SHARED IMPORTED/);
        assert.match(r, /IMPORTED_IMPLIB_RELEASE "[^"]*\/mylib\.lib"/);
        assert.doesNotMatch(r, /IMPORTED_LOCATION_RELEASE "[^"]*\/"/); // no empty location
    });
});
