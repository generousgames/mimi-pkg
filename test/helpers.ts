/**
 * Shared fixtures for the cmake config tests: a throwaway workspace with
 * helpers to lay down bundle libs and render a Config.cmake from a config.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { generate_cmake_config } from "../src/apis/cmake";
import type { BuildConfig, OSType, ArchType, BuildType, LinkType } from "../src/apis/config";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const TEMPLATES = path.join(repoRoot, "templates");

export type CfgInput = {
    os: OSType;
    arch: ArchType;
    build_type: BuildType;
    link_type: LinkType;
    name?: string;
    namespace?: string;
};

export type Workspace = {
    root: string;
    makeLibs: (preset: string, files: string[]) => void;
    cfg: (p: CfgInput) => BuildConfig;
    render: (config: BuildConfig) => string;
    reset: () => void;
    cleanup: () => void;
};

export function tempWorkspace(): Workspace {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mimi-test-"));
    return {
        root,
        makeLibs(preset, files) {
            const dir = path.join(root, "bundles", preset, "contents", "libs");
            fs.mkdirSync(dir, { recursive: true });
            for (const f of files) fs.writeFileSync(path.join(dir, f), "x");
        },
        cfg(p) {
            return {
                rootDir: root,
                namespace: p.namespace ?? "deps",
                name: p.name ?? "pkg",
                version: "1.0.0",
                paths: { build: { bin_dir: "", lib_dir: "", include_dir: "" } },
                platform: { os: p.os, arch: p.arch },
                code_gen: { build_type: p.build_type, link_type: p.link_type },
            } as unknown as BuildConfig;
        },
        render(config) {
            const out = path.join(root, "out.cmake");
            generate_cmake_config(TEMPLATES, config, out);
            return fs.readFileSync(out, "utf8");
        },
        reset() {
            fs.rmSync(path.join(root, "bundles"), { recursive: true, force: true });
        },
        cleanup() {
            fs.rmSync(root, { recursive: true, force: true });
        },
    };
}
