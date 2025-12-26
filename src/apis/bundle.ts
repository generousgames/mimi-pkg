import { generate_abi_from_path, generate_abi_hash } from "./abi.js";
import { log } from "../utils/log";
import { BuildConfig, get_preset } from "./config.js";
import { generate_manifest } from "./manifest.js";
import archiver from "archiver";
import { fs, path } from "zx";
import { generate_cmake_config } from "./cmake.js";

///////////////////////////////////////////////////////////////////////////////

/**
 * Ensures a directory exists.
 * @param p - The path to the directory.
 */
function ensureDir(p: string) {
    fs.mkdirSync(p, { recursive: true });
}

/**
 * Zips a directory into a zip file.
 * @param inputDir - The directory to zip.
 * @param outZipPath - The path to the zip file.
 */
async function zipDir(inputDir: string, outZipPath: string) {
    await fs.promises.mkdir(path.dirname(outZipPath), { recursive: true });

    const output = fs.createWriteStream(outZipPath);
    const archive = archiver("zip", { zlib: { level: 9 } }); // max compression

    const done = new Promise<void>((resolve, reject) => {
        output.on("close", () => resolve());
        output.on("error", reject);
        archive.on("warning", (err: any) => {
            // ENOENT warnings can be ignored; others usually not
            if ((err as any).code === "ENOENT") console.warn(err);
            else reject(err);
        });
        archive.on("error", reject);
    });

    archive.pipe(output);

    // Put folder contents at the root of the zip.
    // If you want the folder name as the top-level entry, replace `false` with `path.basename(inputDir)`.
    archive.directory(inputDir, false);

    await archive.finalize();
    await done;
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Gets the directory of the bundle.
 * @param config - The configuration for the dependency.
 * @returns The directory of the bundle.
 */
export function get_bundle_dir(config: BuildConfig) {
    return path.join(config.rootDir, "bundles", get_preset(config));
}

/**
 * Gets the filename of the bundle.
 * @param config - The configuration for the dependency.
 * @param bundleHash - The hash of the bundle.
 * @returns The filename of the bundle.
 */
export function get_bundle_filename(config: BuildConfig, bundleHash: string) {
    const name = config.name;
    const version = config.version;
    return `${name}-${version}-${bundleHash}.zip`;
}

/**
 * Gets the bundle path.
 * @param config - The configuration for the dependency.
 * @param bundleHash - The hash of the bundle.
 * @returns The bundle path.
 */
export function get_bundle_path(config: BuildConfig, bundleHash: string) {
    const bundleDir = get_bundle_dir(config);
    const fileName = get_bundle_filename(config, bundleHash);
    return path.join(bundleDir, fileName);
}

/**
 * Bundles the dependency given a CMake preset name.
 * @param config - The configuration for the dependency.
 */
export async function bundle_dependency(config: BuildConfig) {
    const { rootDir } = config;

    // print_build_config(config);

    try {
        const fs = await import("fs");
        const path = await import("path");

        // Create folder rootDir/bundles/presetName.
        const bundleDir = get_bundle_dir(config);
        const contentsDir = path.join(bundleDir, "contents");
        fs.rmSync(contentsDir, { recursive: true, force: true });
        ensureDir(contentsDir);

        // Copy license files.
        const licensesDir = path.join(contentsDir, "licenses");
        ensureDir(licensesDir);
        for (const licenseFile of config.paths.license_files ?? []) {
            const srcPath = path.join(rootDir, licenseFile);
            const destPath = path.join(licensesDir, path.basename(licenseFile));
            fs.copyFileSync(srcPath, destPath);
        }

        // Copy headers.
        const srcPath = path.join(rootDir, config.paths.header_dir ?? "");
        const destPath = path.join(contentsDir, "include");
        fs.cpSync(srcPath, destPath, { recursive: true });

        // Copy static libs.
        const staticLibsDir = path.join(rootDir, "build", "lib", config.code_gen.build_type);
        fs.cpSync(staticLibsDir, path.join(contentsDir, "libs"), { recursive: true });

        // Create CMake config.
        const templatesDir = path.join(rootDir, "node_modules", "@generousgames", "mimi-pkg", "dist", "templates");
        const cmakeDir = path.join(contentsDir, "cmake");
        const cmakeConfigPath = path.join(cmakeDir, `${config.name}Config.cmake`);
        ensureDir(cmakeDir);
        generate_cmake_config(templatesDir, config, cmakeConfigPath);

        // Create manifest.
        const preset = get_preset(config);
        const abiJSONPath = path.join(rootDir, "projects", preset, "abi.json");
        const abi = generate_abi_from_path(abiJSONPath);
        const hash = generate_abi_hash(abi);
        const manifest = generate_manifest(config, hash);
        fs.writeFileSync(path.join(contentsDir, "manifest.json"), JSON.stringify(manifest, null, 2));

        // Create bundle.
        const bundlePath = get_bundle_path(config, hash);
        {
            log.info(`Bundling ${config.name}(${config.version})...`);
            log.info(`> Destination: ${bundlePath}`);
        }
        await zipDir(contentsDir, bundlePath);

        log.ok(`Bundled successfully!`);
    } catch (error) {
        log.err(`Failed to bundle ${config.name}(${config.version})`);
        throw error;
    }
}