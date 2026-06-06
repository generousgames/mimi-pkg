/**
 * Tests for src/apis/abi.ts.
 *
 * The ABI hash is the bundle's cache key, so its stability matters: a silent
 * change to the fingerprint format would invalidate every cached bundle. The
 * golden hash below locks that format.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
    generate_abi_from_path,
    generate_abi_hash,
    generate_abi_short_hash,
    type AbiInfo,
} from "../src/apis/abi";

const base: AbiInfo = {
    triple: "macos-arm64-clang17",
    os: "macos",
    arch: "arm64",
    compilerFamily: "clang",
    compilerFrontendMajor: 17,
    buildType: "Release",
    stdlib: "libc++",
    cppStd: 20,
};

// shasum (sha1) of "macos|arm64|clang|17|Release|libc++|20"
const GOLDEN = "18227c2b44250f3b8ca45a907be657115eb6530b";

describe("abi hashing", () => {
    it("produces the locked golden hash for a known ABI (fingerprint format)", () => {
        assert.equal(generate_abi_hash(base), GOLDEN);
    });

    it("is a 40-char hex sha1 and deterministic", () => {
        const h = generate_abi_hash(base);
        assert.match(h, /^[0-9a-f]{40}$/);
        assert.equal(generate_abi_hash({ ...base }), h);
    });

    it("ignores the triple (not part of the fingerprint)", () => {
        assert.equal(generate_abi_hash({ ...base, triple: "something-else" }), GOLDEN);
    });

    it("changes when any fingerprint field changes", () => {
        const h = generate_abi_hash(base);
        assert.notEqual(generate_abi_hash({ ...base, arch: "x86_64" }), h);
        assert.notEqual(generate_abi_hash({ ...base, buildType: "Debug" }), h);
        assert.notEqual(generate_abi_hash({ ...base, compilerFrontendMajor: 18 }), h);
        assert.notEqual(generate_abi_hash({ ...base, cppStd: 17 }), h);
    });

    it("short hash slices the requested number of characters", () => {
        assert.equal(generate_abi_short_hash(base), GOLDEN.slice(0, 8));
        assert.equal(generate_abi_short_hash(base, 12), GOLDEN.slice(0, 12));
    });
});

describe("generate_abi_from_path", () => {
    let dir: string;
    before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "mimi-abi-")); });
    after(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    it("reads ABI fields from a JSON file", () => {
        const p = path.join(dir, "abi.json");
        fs.writeFileSync(p, JSON.stringify(base));
        const abi = generate_abi_from_path(p);
        assert.deepEqual(abi, base);
        assert.equal(generate_abi_hash(abi), GOLDEN);
    });
});
