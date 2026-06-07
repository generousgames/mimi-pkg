import { BuildConfig } from "./config";

export function generate_manifest(config: BuildConfig, abiHash: string, triple: string, buildHash: string) {
    return {
        name: config.name,
        version: config.version,
        triple: triple,
        // ABI compatibility fingerprint: "is this compatible with my toolchain?"
        abiHash: abiHash,
        // Build identity over the inputs: "is this the same build?" (names the bundle).
        buildHash: buildHash,
        platform: config.platform,
        compiler: config.compiler,
        language: config.language,
        code_gen: config.code_gen,
        runtime: config.runtime,
    };
}