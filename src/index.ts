#!/usr/bin/env node
"use strict";

import path from "path";
import { build_dependency } from "./apis/build";
import { bundle_dependency } from "./apis/bundle";
import { deploy_dependency } from "./apis/deploy";
import { log } from "./utils/log";
import { fs } from "zx";
import { load_build_config } from "./apis/config";
import { findRepoRoot } from "./utils/repo";

///////////////////////////////////////////////////////////////////////////////

/**
 * Sets up prebuild-utils.
 * @param argv - The command line arguments.
 */
function setup(argv: string[]) {
    const rootDir = findRepoRoot(process.cwd());

    log.info(`Setting prebuild-utils...`);
    log.info(`> Root: ${rootDir}`);

    // TODO
    // + Check if nodejs is installed with the right version.
    // + Check if CMake is installed.
    // + Check if Emscripten is installed.

    // deps_sync(rootDir, "macos-arm64-clang17");
}

/**
 * Cleans temporary build directories.
 */
function clean() {
    const rootDir = findRepoRoot(process.cwd());
    log.info(`Cleaning...`);
    log.info(`> Root: ${rootDir}`);

    const dirs = ["build", "projects", "bundles"];
    for (const dir of dirs) {
        const full = path.join(rootDir, dir);
        if (fs.existsSync(full)) {
            fs.rmSync(full, { recursive: true, force: true });
            log.info(`> Removed ${full}`);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Builds the dependency given a CMake preset name.
 * @param argv - The command line arguments.
 */
function build(argv: string[]) {
    if (argv.length !== 1) {
        log.err("Usage: mimi-cli pkg build <config_name>");
        process.exit(1);
    }
    const configName = argv[0];

    const rootDir = findRepoRoot(process.cwd());
    const config = load_build_config(rootDir, configName);
    if (!config) {
        log.err(`Config ${configName} not found in manifest.`);
        process.exit(1);
    }

    build_dependency(config);
}

/**
 * Bundles the dependency given a CMake preset name.
 * @param argv - The command line arguments.
 */
function bundle(argv: string[]) {
    if (argv.length !== 1) {
        log.err("Usage: mimi-cli pkg bundle <config_name>");
        process.exit(1);
    }
    const configName = argv[0];

    const rootDir = findRepoRoot(process.cwd());
    const config = load_build_config(rootDir, configName);
    if (!config) {
        log.err(`Config ${configName} not found in manifest.`);
        process.exit(1);
    }

    bundle_dependency(config);
}

/**
 * Deploys the dependency given a CMake preset name.
 * @param argv - The command line arguments.
 */
function deploy(argv: string[]) {
    if (argv.length !== 1) {
        log.err("Usage: mimi-cli pkg deploy <config_name>");
        process.exit(1);
    }
    const configName = argv[0];
    const rootDir = findRepoRoot(process.cwd());
    const config = load_build_config(rootDir, configName);
    if (!config) {
        log.err(`Config ${configName} not found in manifest.`);
        process.exit(1);
    }

    deploy_dependency(config);
}


/**
 * Executes the package API.
 * @param argv - The command line arguments.
 */
export function execute(argv: string[]) {
    const command = argv[0];
    if (command === "setup") {
        setup(argv.slice(1));
    } else if (command === "build") {
        build(argv.slice(1));
    } else if (command === "bundle") {
        bundle(argv.slice(1));
    } else if (command === "deploy") {
        deploy(argv.slice(1));
    } else if (command === "clean") {
        clean();
    } else {
        log.info(`Usage: mimi-pkg <command> <args...>`);
        log.info(`Commands:`);
        log.info(`> mimi-pkg setup`);
        log.info(`> mimi-pkg build <config_name>`);
        log.info(`> mimi-pkg bundle <config_name>`);
        log.info(`> mimi-pkg deploy <config_name>`);
        log.info(`> mimi-pkg clean`);
        process.exit(1);
    }
}

execute(process.argv.slice(2));