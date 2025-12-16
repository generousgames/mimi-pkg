import { BuildConfig } from "./config";

export function generate_manifest(config: BuildConfig, hash: string) {
    return {
        name: config.name,
        version: config.version,
        hash: hash,
        platform: config.platform,
        compiler: config.compiler,
        language: config.language,
        code_gen: config.code_gen,
        runtime: config.runtime,
    };
}