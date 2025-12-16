import { BuildConfig, get_preset } from "./config.js";
import { run, ensureTool } from "../utils/exec.js";
import { log } from "../utils/log";

/**
 * Builds the dependency given a CMake preset name.
 * @param config - The configuration for the dependency.
 */
export async function build_dependency(config: BuildConfig) {
    const { rootDir, platform, compiler, language, code_gen, runtime } = config;

    // print_build_config(config);

    try {
        const env = {
            ...process.env,
            BUILD_OS: platform.os,
            BUILD_ARCH: platform.arch,
            BUILD_TYPE: code_gen.build_type,
            // TODO: Other compiler settings (eg. RTTI, exceptions, etc.).
            // TODO: Other dependency specific flags (eg. GLFW_BUILD_EXAMPLES, GLFW_BUILD_DOCS, etc.).
        } as Record<string, string>;

        const presetName = get_preset(config);

        log.info(`Building ${config.name}(${config.version})...`);
        log.info(`> Preset: ${presetName}`);
        log.info(`> Compiler: ${compiler.c} ${compiler.cpp} ${runtime.stdlib} ${language.cpp_std} ${code_gen.optimization}`);
        if (platform.os === "macos") {
            env["BUILD_OSX_DEPLOYMENT_TARGET"] = runtime.deployment_target;
            log.info(`> macOS Deployment Target: ${runtime.deployment_target}`);
        } else if (platform.os === "ios") {
            env["BUILD_IOS_DEPLOYMENT_TARGET"] = runtime.deployment_target;
            log.info(`> iOS Deployment Target: ${runtime.deployment_target}`);
        }

        await ensureTool("cmake");
        await run("cmake", ["--preset", presetName], { cwd: rootDir, env, verbose: true });
        await run("cmake", ["--build", `projects/${presetName}`, "--config", code_gen.build_type, "--parallel"], { cwd: rootDir, env, verbose: true });

        log.ok(`Built successfully!`);
    } catch (error) {
        log.err(`Failed to build ${config.name}(${config.version})`);
        throw error;
    }
}