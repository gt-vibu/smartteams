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
import type { FilePurpose } from '../../generated/prisma/enums';
import { fileExtension, fileStorageFolder } from '../../modules/files/file-naming';
import type { EmployeeDocumentType } from '../../modules/files/file.constants';

@Injectable()
export class StorageService {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('AWS_S3_BUCKET');
    // AWS S3 only: the SDK resolves AWS's own endpoint. There is no endpoint override — the one
    // that existed served a MinIO test double, and the project uses no emulator anywhere.
    this.client = new S3Client({
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

  createObjectKey(
    organizationId: string,
    purpose: FilePurpose,
    originalName: string,
    options?: {
      employeeId?: string;
      documentType?: EmployeeDocumentType;
      contentType?: string;
    },
  ) {
    const extension = fileExtension(originalName, options?.contentType);
    const folder = fileStorageFolder(
      organizationId,
      purpose,
      options?.employeeId,
      options?.documentType,
    );
    return `${folder}/${randomUUID()}${extension}`;
  }

  async createUploadUrl(input: {
    key: string;
    contentType: string;
    byteSize?: number;
    checksumSha256?: string;
    expiresIn?: number;
  }) {
    const headers = {
      'x-amz-server-side-encryption': 'AES256',
      ...(input.checksumSha256 && /^[0-9a-f]{64}$/i.test(input.checksumSha256)
        ? {
            'x-amz-checksum-sha256': Buffer.from(input.checksumSha256, 'hex').toString('base64'),
          }
        : {}),
    };
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        ContentType: input.contentType,
        Key: input.key,
        ...(input.byteSize === undefined ? {} : { ContentLength: input.byteSize }),
        ...(input.checksumSha256 && /^[0-9a-f]{64}$/i.test(input.checksumSha256)
          ? { ChecksumSHA256: Buffer.from(input.checksumSha256, 'hex').toString('base64') }
          : {}),
        ServerSideEncryption: 'AES256',
      }),
      { expiresIn: input.expiresIn ?? 600 },
    );
    return { url, headers };
  }

  async head(key: string) {
    return this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key, ChecksumMode: 'ENABLED' }),
    );
  }

  async createDownloadUrl(
    key: string,
    options?: { expiresIn?: number; fileName?: string; contentType?: string; inline?: boolean },
  ) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(options?.contentType ? { ResponseContentType: options.contentType } : {}),
      ...(options?.fileName
        ? {
            ResponseContentDisposition: `${options.inline ? 'inline' : 'attachment'}; filename="${options.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
          }
        : {}),
    });
    return getSignedUrl(this.client, command, { expiresIn: options?.expiresIn ?? 600 });
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
