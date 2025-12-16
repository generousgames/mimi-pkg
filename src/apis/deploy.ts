import path from "path";
import { BuildConfig, get_preset } from "./config.js";
import { log } from "../utils/log.js";
import { s3_putObjectFile, AWSUploadCredentials, AWSUploadOptions, AWSRegion } from "./aws.js";
import { get_bundle_path, get_bundle_filename } from "./bundle.js";
import { generate_abi_from_path, generate_abi_hash } from "./abi.js";

export type DeployConfig = {
    region: string;
};

/**
 * Gets the remote bucket path.
 * @param name - The name of the dependency.
 * @param triple - The triple of the dependency.
 * @param buildType - The build type of the dependency.
 * @param filename - The filename of the dependency.
 * @returns The remote bucket path.
 */
function get_remote_bucket_path(name: string, triple: string, buildType: string, filename: string, uploadRoot: string) {
    return path.join(uploadRoot, `${name}`, `${triple}`, `${buildType}`, filename);
}

/**
 * Deploys the dependency given a CMake preset name.
 * @param config - The configuration for the dependency.
 */
export async function deploy_dependency(config: BuildConfig) {
    const { rootDir } = config;

    // print_build_config(config);

    try {
        if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
            throw new Error("AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) not set");
        }
        if (!process.env.AWS_REGION) {
            throw new Error("AWS region (AWS_REGION) not set");
        }
        if (!process.env.AWS_S3_BUCKET || !process.env.AWS_S3_UPLOAD_ROOT) {
            throw new Error("AWS S3 bucket (AWS_S3_BUCKET) or upload root (AWS_S3_UPLOAD_ROOT) not set");
        }

        const awsUploadCredentials: AWSUploadCredentials = {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        };

        const awsUploadOptions: AWSUploadOptions = {
            cacheControl: "public, max-age=31536000, immutable",
            region: process.env.AWS_REGION as AWSRegion,
            credentials: awsUploadCredentials,
        };

        // Generate ABI information.
        const preset = get_preset(config);
        const abiJSONPath = path.join(rootDir, "projects", preset, "abi.json");
        const abi = generate_abi_from_path(abiJSONPath);
        
        // Generate local bundle path.
        const hash = generate_abi_hash(abi);
        const localBundlePath = get_bundle_path(config, hash);

        // Generate remote bucket path.
        const buildType = config.code_gen.build_type;
        const fileName = get_bundle_filename(config, hash);
        const remoteBucketPath = get_remote_bucket_path(config.name, abi.triple, buildType, fileName, process.env.AWS_S3_UPLOAD_ROOT);

        log.info(`Deploying to AWS S3...`);
        log.info(`> Region: ${process.env.AWS_REGION}`);
        log.info(`> Source: ${localBundlePath}`);
        log.info(`> Destination: s3://${process.env.AWS_S3_BUCKET}/${remoteBucketPath}`);

        await s3_putObjectFile(process.env.AWS_S3_BUCKET, remoteBucketPath, localBundlePath, awsUploadOptions);

        log.ok(`Deployed successfully!`);
    } catch (error) {
        log.err(`Failed to deploy ${config.name}(${config.version})`);
        throw error;
    }
}

