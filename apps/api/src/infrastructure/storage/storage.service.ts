import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

@Injectable()
export class StorageService {
  private readonly bucket: string;
  private readonly client: S3Client;
  private readonly kmsKeyId?: string;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('AWS_S3_BUCKET');
    this.kmsKeyId = config.get<string>('AWS_S3_KMS_KEY_ID') || undefined;
    this.client = new S3Client({
      endpoint: config.get<string>('AWS_S3_ENDPOINT') || undefined,
      forcePathStyle: config.get<boolean>('AWS_S3_FORCE_PATH_STYLE', false),
      region: config.getOrThrow<string>('AWS_REGION'),
      ...(config.get<string>('AWS_ACCESS_KEY_ID') && config.get<string>('AWS_SECRET_ACCESS_KEY')
        ? {
            credentials: {
              accessKeyId: config.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
              secretAccessKey: config.getOrThrow<string>('AWS_SECRET_ACCESS_KEY'),
            },
          }
        : {}),
    });
  }

  getBucket() {
    return this.bucket;
  }

  createObjectKey(organizationId: string, purpose: string, originalName: string) {
    const extension = originalName
      .split('.')
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    return `${organizationId}/${purpose}/${randomUUID()}${extension ? `.${extension}` : ''}`;
  }

  async createUploadUrl(input: {
    key: string;
    contentType: string;
    byteSize?: number;
    checksumSha256?: string;
    expiresIn?: number;
  }) {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        ContentType: input.contentType,
        Key: input.key,
        ...(input.byteSize === undefined ? {} : { ContentLength: input.byteSize }),
        ...(input.checksumSha256 && /^[0-9a-f]{64}$/i.test(input.checksumSha256)
          ? { ChecksumSHA256: Buffer.from(input.checksumSha256, 'hex').toString('base64') }
          : {}),
        ServerSideEncryption: 'aws:kms',
        ...(this.kmsKeyId ? { SSEKMSKeyId: this.kmsKeyId } : {}),
      }),
      { expiresIn: input.expiresIn ?? 600 },
    );
  }

  async head(key: string) {
    return this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key, ChecksumMode: 'ENABLED' }),
    );
  }

  async createDownloadUrl(key: string, expiresIn = 600) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn,
    });
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
