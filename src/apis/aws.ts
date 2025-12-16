import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "node:fs";

export type AWSRegion = "us-west-2";

export type AWSUploadCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
};

export type AWSUploadOptions = {
  cacheControl?: string;
  contentType?: string;
  region?: AWSRegion;
  credentials?: AWSUploadCredentials;
};

/*
 * Uploads a file to an S3 bucket.
 * @param bucket - The name of the bucket.
 * @param key - The key of the object.
 * @param filePath - The path to the file.
 * @param opts - The options for the upload.
 */
export async function s3_putObjectFile(
  bucket: string,
  key: string,
  filePath: string,
  opts: AWSUploadOptions = {}
) {
  const { cacheControl, contentType, region, credentials } = opts;
  const Body = fs.createReadStream(filePath);

  const client = new S3Client({
    region: region,
    credentials: credentials
      ? { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey }
      : undefined,
  });
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body,
      ContentType: contentType,
      CacheControl: cacheControl,
    })
  );
}