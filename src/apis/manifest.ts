import { BuildConfig } from "./config";

export function generate_manifest(config: BuildConfig, hash: string, triple: string, provenance: string) {
    return {
        name: config.name,
        version: config.version,
        triple: triple,
        // ABI compatibility fingerprint (toolchain/config).
        hash: hash,
        // Identity/provenance hash (changes when the build inputs change).
        provenance: provenance,
        platform: config.platform,
        compiler: config.compiler,
        language: config.language,
        code_gen: config.code_gen,
        runtime: config.runtime,
    };
}