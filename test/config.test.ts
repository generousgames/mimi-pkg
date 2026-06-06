/**
 * Tests for src/apis/config.ts: preset naming and manifest loading.
 *
 * load_build_config's missing-manifest path is intentionally not tested: it
 * calls process.exit(1), which would kill the test runner.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { get_preset, load_build_config, type BuildConfig } from "../src/apis/config";

describe("get_preset", () => {
    it("joins os-arch-build_type", () => {
        const cfg = {
            platform: { os: "windows", arch: "x86_64" },
            code_gen: { build_type: "Debug" },
        } as unknown as BuildConfig;
        assert.equal(get_preset(cfg), "windows-x86_64-Debug");
    });
});

describe("load_build_config", () => {
    let root: string;
    const preset = "macos-arm64-Release";
    before(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "mimi-cfg-"));
        const manifest = {
            name: "zlib",
            version: "1.3.1",
            license_files: ["LICENSE"],
            build_paths: { bin_dir: "bin", lib_dir: "lib", include_dir: "include" },
            configs: {
                [preset]: {
                    platform: { os: "macos", arch: "arm64" },
                    code_gen: { build_type: "Release", link_type: "Static", optimization: "-O3" },
                },
            },
        };
        fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest));
    });
    after(() => { fs.rmSync(root, { recursive: true, force: true }); });

    it("merges top-level fields, build paths, and the selected preset", () => {
        const cfg = load_build_config(root, preset)!;
        assert.equal(cfg.rootDir, root);
        assert.equal(cfg.name, "zlib");
        assert.equal(cfg.version, "1.3.1");
        assert.equal(cfg.paths.build.lib_dir, "lib");
        assert.deepEqual(cfg.paths.license_files, ["LICENSE"]);
        // spread from configs[preset]
        assert.equal(cfg.platform.os, "macos");
        assert.equal(cfg.code_gen.build_type, "Release");
        assert.equal(cfg.code_gen.link_type, "Static");
        // round-trips back to the requested preset
        assert.equal(get_preset(cfg), preset);
    });
});
