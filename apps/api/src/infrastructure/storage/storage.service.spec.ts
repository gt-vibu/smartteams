import { StorageService } from './storage.service';

describe('StorageService', () => {
  it('returns the headers required by its encrypted presigned upload', async () => {
    const service = new StorageService({
      getOrThrow: (key: string) =>
        key === 'AWS_S3_BUCKET' ? 'smarteam-test-assets' : 'ap-south-1',
      get: (key: string, fallback?: unknown) =>
        key === 'AWS_ACCESS_KEY_ID'
          ? 'test-access-key'
          : key === 'AWS_SECRET_ACCESS_KEY'
            ? 'test-secret-key'
            : fallback,
    } as never);

    const upload = await service.createUploadUrl({
      key: 'organisation-1/EMPLOYEE_DOCUMENT/file.pdf',
      contentType: 'application/pdf',
      byteSize: 128,
    });

    expect(upload.headers).toEqual({
      'x-amz-server-side-encryption': 'AES256',
    });
    expect(new URL(upload.url).searchParams.get('X-Amz-SignedHeaders')).toContain(
      'x-amz-server-side-encryption',
    );
  });
});
