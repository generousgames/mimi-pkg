/**
 * Tests for the generated Config.cmake beyond raw discovery: the aggregate
 * interface target, package-variable sanitization, and single-config output.
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { tempWorkspace, type Workspace } from "./helpers";
import { log } from "../src/utils/log";

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

    describe("single vs multi config (#5)", () => {
        it("single-config build emits a config-agnostic IMPORTED_LOCATION", () => {
            ws.makeLibs("macos-arm64-Release", ["libz.a"]);
            const r = ws.render(ws.cfg({ os: "macos", arch: "arm64", build_type: "Release", link_type: "Static" }));
            assert.match(r, /IMPORTED_LOCATION "[^"]*\/libz\.a"/);
            assert.doesNotMatch(r, /IMPORTED_LOCATION_RELEASE/);
            assert.doesNotMatch(r, /IMPORTED_CONFIGURATIONS/);
        });

        it("debug-only build is also config-agnostic", () => {
            ws.makeLibs("macos-arm64-Debug", ["libz.a"]);
            const r = ws.render(ws.cfg({ os: "macos", arch: "arm64", build_type: "Debug", link_type: "Static" }));
            assert.match(r, /IMPORTED_LOCATION "[^"]*\/libz\.a"/);
            assert.doesNotMatch(r, /IMPORTED_LOCATION_DEBUG/);
            assert.doesNotMatch(r, /IMPORTED_CONFIGURATIONS/);
        });

        it("multi-config build keeps per-config locations (not collapsed)", () => {
            ws.makeLibs("macos-arm64-Release", ["libz.a"]);
            ws.makeLibs("macos-arm64-Debug", ["libz.a"]);
            const r = ws.render(ws.cfg({ os: "macos", arch: "arm64", build_type: "Release", link_type: "Static" }));
            assert.match(r, /IMPORTED_CONFIGURATIONS DEBUG/);
            assert.match(r, /IMPORTED_LOCATION_DEBUG "[^"]*\/libz\.a"/);
            assert.match(r, /IMPORTED_LOCATION_RELEASE "[^"]*\/libz\.a"/);
            assert.doesNotMatch(r, /IMPORTED_LOCATION "/); // not the config-agnostic form
        });
    });

    it("warns when no libraries are discovered (#6), exporting headers only", () => {
        const original = log.warn;
        const warnings: string[] = [];
        log.warn = (...m: unknown[]) => { warnings.push(m.join(" ")); };
        try {
            // no makeLibs -> nothing under bundles/<preset>/contents/libs
            const r = ws.render(ws.cfg({ os: "macos", arch: "arm64", build_type: "Release", link_type: "Static" }));
            assert.ok(warnings.some((w) => /No libraries discovered/.test(w)), `warnings: ${warnings}`);
            assert.doesNotMatch(r, /add_library\(/); // no targets, header-only config
        } finally {
            log.warn = original;
        }
    });
});
