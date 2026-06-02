/**
 * Local S3-compatible storage module.
 * S3-compatible object storage helpers backed by AWS SDK + MinIO support.
 *
 * Environment variables:
 *   S3_ENDPOINT   - e.g. http://127.0.0.1:9000 (MinIO) or any S3-compatible endpoint
 *   S3_REGION     - default us-east-1
 *   S3_BUCKET     - bucket name
 *   S3_ACCESS_KEY - access key
 *   S3_SECRET_KEY - secret key
 */

import {
  S3Client,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const S3_ENDPOINT = process.env.S3_ENDPOINT || 'http://127.0.0.1:9000';
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const S3_BUCKET = process.env.S3_BUCKET || 'xp-experience-media';
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || 'minioadmin';
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || 'minioadmin';

let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3Client) {
    const endpoint = S3_ENDPOINT;
    _s3Client = new S3Client({
      region: S3_REGION,
      endpoint,
      credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY,
      },
      forcePathStyle: endpoint.includes('127.0.0.1') || endpoint.includes('localhost'),
    });
  }
  return _s3Client;
}

/**
 * Upload a file to S3-compatible storage.
 * Uses multipart upload for large files via @aws-sdk/lib-storage.
 */
export async function uploadFile(params: {
  fileContent: Buffer;
  fileName: string;
  contentType: string;
}): Promise<string> {
  const client = getS3Client();

  const upload = new Upload({
    client,
    params: {
      Bucket: S3_BUCKET,
      Key: params.fileName,
      Body: params.fileContent,
      ContentType: params.contentType,
    },
  });

  await upload.done();
  return params.fileName;
}

/**
 * Generate a presigned URL for temporary file access.
 * @param params.key - S3 object key
 * @param params.expireTime - URL expiry in seconds (default 86400 = 1 day)
 */
export async function generatePresignedUrl(params: {
  key: string;
  expireTime?: number;
}): Promise<string> {
  const client = getS3Client();
  const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: params.key });
  const url = await getSignedUrl(client, command, {
    expiresIn: params.expireTime || 86400,
  });
  return url;
}

export { S3_BUCKET };
