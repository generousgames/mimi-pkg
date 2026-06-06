/**
 * Tests for the pure bundle-path helpers in src/apis/bundle.ts. These lock the
 * on-disk bundle naming scheme (name-version-hash.zip under bundles/<preset>).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { get_bundle_dir, get_bundle_filename, get_bundle_path } from "../src/apis/bundle";
import type { BuildConfig } from "../src/apis/config";

const cfg = {
    rootDir: "/repo",
    name: "pkg",
    version: "1.0.0",
    platform: { os: "macos", arch: "arm64" },
    code_gen: { build_type: "Release" },
} as unknown as BuildConfig;

describe("bundle paths", () => {
    it("get_bundle_dir -> rootDir/bundles/<preset>", () => {
        assert.equal(get_bundle_dir(cfg), path.join("/repo", "bundles", "macos-arm64-Release"));
    });

    it("get_bundle_filename -> name-version-hash.zip", () => {
        assert.equal(get_bundle_filename(cfg, "abc123"), "pkg-1.0.0-abc123.zip");
    });

    it("get_bundle_path -> dir/filename", () => {
        assert.equal(
            get_bundle_path(cfg, "abc123"),
            path.join("/repo", "bundles", "macos-arm64-Release", "pkg-1.0.0-abc123.zip")
        );
    });
});
