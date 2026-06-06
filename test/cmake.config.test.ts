/**
 * Tests for the generated Config.cmake beyond raw discovery: the aggregate
 * interface target, package-variable sanitization, and single-config output.
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { tempWorkspace, type Workspace } from "./helpers";

describe("cmake config generation", () => {
    let ws: Workspace;
    before(() => { ws = tempWorkspace(); });
    after(() => { ws.cleanup(); });
    beforeEach(() => { ws.reset(); });

    describe("aggregate interface target", () => {
        it("emits a namespaced INTERFACE target that links every discovered lib", () => {
            ws.makeLibs("macos-arm64-Release", ["libz.a", "libpng.a"]);
            const r = ws.render(ws.cfg({ os: "macos", arch: "arm64", build_type: "Release", link_type: "Static" }));
            assert.match(r, /add_library\(deps::pkg INTERFACE IMPORTED GLOBAL\)/);
            // links both libs, joined by ';'
            const m = r.match(/set\(_pkg_interface_libs ([^)]*)\)/);
            assert.ok(m, "interface libs list should be defined");
            const list = m![1];
            assert.ok(list.includes("libz") && list.includes("libpng"), `got: ${list}`);
            assert.ok(list.includes(";"), "multiple libs should be ';'-separated");
            assert.match(r, /INTERFACE_LINK_LIBRARIES\s*\n\s*\$\{_pkg_interface_libs\}/);
        });

        it("puts the package include dir on the interface target", () => {
            ws.makeLibs("macos-arm64-Release", ["libz.a"]);
            const r = ws.render(ws.cfg({ os: "macos", arch: "arm64", build_type: "Release", link_type: "Static" }));
            assert.match(r, /INTERFACE_INCLUDE_DIRECTORIES\s*\n\s*"\$\{_pkg_includedir\}"/);
        });

        it("a single lib produces no trailing ';' separator", () => {
            ws.makeLibs("macos-arm64-Release", ["libz.a"]);
            const r = ws.render(ws.cfg({ os: "macos", arch: "arm64", build_type: "Release", link_type: "Static" }));
            assert.match(r, /set\(_pkg_interface_libs libz\)/);
        });

        it("falls back to the bare name when there is no namespace", () => {
            ws.makeLibs("macos-arm64-Release", ["libz.a"]);
            const r = ws.render(ws.cfg({ os: "macos", arch: "arm64", build_type: "Release", link_type: "Static", namespace: "" }));
            assert.match(r, /add_library\(pkg INTERFACE IMPORTED GLOBAL\)/);
            assert.doesNotMatch(r, /::/);
        });
    });

    it("sanitizes the package variable (non-alphanumerics -> '_')", () => {
        ws.makeLibs("macos-arm64-Release", ["libz.a"]);
        const r = ws.render(ws.cfg({ os: "macos", arch: "arm64", build_type: "Release", link_type: "Static", name: "my+pkg" }));
        assert.match(r, /_my_pkg_libdir/);
        assert.doesNotMatch(r, /_my\+pkg_/);
    });

    it("debug-only preset emits DEBUG locations and no RELEASE", () => {
        ws.makeLibs("macos-arm64-Debug", ["libz.a"]);
        const r = ws.render(ws.cfg({ os: "macos", arch: "arm64", build_type: "Debug", link_type: "Static" }));
        assert.match(r, /IMPORTED_CONFIGURATIONS DEBUG/);
        assert.match(r, /IMPORTED_LOCATION_DEBUG "[^"]*\/libz\.a"/);
        assert.doesNotMatch(r, /_RELEASE/);
    });

    // Known gaps tracked for a future change (see merge commit notes):
    it("single-config builds should emit a config-agnostic IMPORTED_LOCATION (#5)", { todo: true });
    it("empty discovery should warn instead of silently producing an empty config (#6)", { todo: true });
});
