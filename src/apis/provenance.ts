import shasum from "shasum";
import fs from "node:fs";
import path from "node:path";
import { BuildConfig, get_preset } from "./config.js";

/**
 * Deterministic JSON serialization (recursively sorted keys) so the provenance
 * hash is stable across machines and identical between `bundle` and `deploy`.
 */
function stable_stringify(value: any): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
    if (Array.isArray(value)) return `[${value.map(stable_stringify).join(",")}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stable_stringify(value[k])}`).join(",")}}`;
}

/**
 * Reads the cacheVariables of the matching configurePreset from CMakePresets.json.
 * These capture build options (e.g. LLVM_ENABLE_DIA_SDK, *_BUILD_TOOLS) that change
 * the output but are not part of the manifest.
 */
function read_preset_cache_vars(rootDir: string, presetName: string): Record<string, unknown> {
    const presetsPath = path.join(rootDir, "CMakePresets.json");
    if (!fs.existsSync(presetsPath)) return {};
    try {
        const json = JSON.parse(fs.readFileSync(presetsPath, "utf8"));
        const preset = (json.configurePresets ?? []).find((p: any) => p?.name === presetName);
        return (preset && preset.cacheVariables) || {};
    } catch {
        return {};
    }
}

/**
 * Provenance / identity hash. Unlike the ABI hash (a compatibility fingerprint),
 * this changes whenever the *inputs* that determine the artifact change: package
 * version, ABI, manifest build settings, and the preset's build options. It is
 * deterministic, so it does not churn on non-reproducible compiler output the way
 * hashing the binaries would.
 *
 * @param config - The build configuration.
 * @param abiFingerprint - The ABI fingerprint string for this build.
 * @returns The provenance hash.
 */
export function generate_provenance_hash(config: BuildConfig, abiFingerprint: string): string {
    const presetName = get_preset(config);
    const inputs = {
        name: config.name,
        version: config.version,
        namespace: config.namespace,
        abi: abiFingerprint,
        platform: config.platform,
        compiler: config.compiler,
        language: config.language,
        code_gen: config.code_gen,
        runtime: config.runtime,
        preset: read_preset_cache_vars(config.rootDir, presetName),
    };
    return shasum(stable_stringify(inputs));
}
