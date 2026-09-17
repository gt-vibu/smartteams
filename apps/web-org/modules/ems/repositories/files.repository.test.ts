import { afterEach, describe, expect, it, vi } from 'vitest';
import { filesRepository } from './files.repository';

const ORG = '11111111-1111-4111-8111-111111111111';
const FILE = '22222222-2222-4222-8222-222222222222';

function mockFetch(status: number, body: unknown) {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    headers: { getSetCookie: () => [] },
    json: () => Promise.resolve(body),
  };
  const spy = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('filesRepository', () => {
  it('begins an upload on the tenant-scoped path with credentials', async () => {
    const spy = mockFetch(200, {
      fileId: FILE,
      objectKey: 'org/doc.pdf',
      uploadUrl: 'https://storage.example/put',
      expiresIn: 600,
    });
    await filesRepository.beginUpload(ORG, {
      purpose: 'EMPLOYEE_DOCUMENT',
      originalName: 'doc.pdf',
      contentType: 'application/pdf',
      byteSize: 1024,
    });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/v1/organizations/${ORG}/files/uploads`);
    expect(init.credentials).toBe('include');
  });

  it('rejects an upload ticket whose shape does not match the contract', async () => {
    mockFetch(200, { fileId: 'not-a-uuid' });
    await expect(
      filesRepository.beginUpload(ORG, {
        purpose: 'OTHER',
        originalName: 'a.txt',
        contentType: 'text/plain',
        byteSize: 1,
      }),
    ).rejects.toThrow('was not valid');
  });

  it('reads the byte size the server reports, whether string or number', async () => {
    mockFetch(200, {
      id: FILE,
      purpose: 'EMPLOYEE_DOCUMENT',
      status: 'AVAILABLE',
      originalName: 'doc.pdf',
      contentType: 'application/pdf',
      // BigInt serialises as a string.
      byteSize: '2411724',
    });
    const stored = await filesRepository.completeUpload(ORG, FILE);

    expect(stored.byteSize).toBe(2411724);
  });

  it('url-encodes the file id on every per-file route', async () => {
    const spy = mockFetch(200, { fileId: FILE, downloadUrl: 'https://x', expiresIn: 600 });
    await filesRepository.download(ORG, 'file/../../etc');

    const [url] = spy.mock.calls[0] as [string];
    expect(url).not.toContain('file/../../etc');
    expect(url).toContain(encodeURIComponent('file/../../etc'));
  });

  it('sends the audited reason when deleting', async () => {
    const spy = mockFetch(200, {});
    await filesRepository.remove(ORG, FILE, 'Uploaded in error');

    const [url, init] = spy.mock.calls[0] as [string, { body: string }];
    expect(url).toContain(`/files/${FILE}/delete`);
    expect(JSON.parse(init.body)).toEqual({ reason: 'Uploaded in error' });
  });

  it('propagates an API failure rather than swallowing it', async () => {
    mockFetch(409, { detail: 'File type or size is not allowed for this purpose' });
    await expect(
      filesRepository.beginUpload(ORG, {
        purpose: 'PROFILE_IMAGE',
        originalName: 'huge.png',
        contentType: 'image/png',
        byteSize: 999_999_999,
      }),
    ).rejects.toThrow();
  });

  it('exposes exactly the operations the API supports', () => {
    // Asserted rather than assumed: an operation here with nothing to call would mean someone had
    // reconstructed a capability the backend cannot serve.
    expect(Object.keys(filesRepository).sort()).toEqual([
      'beginUpload',
      'completeUpload',
      'download',
      'list',
      'putBytes',
      'remove',
    ]);
  });

  it('lets the API decide whose files come back, filtering nothing client-side', async () => {
    const spy = mockFetch(200, []);
    await filesRepository.list(ORG);

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain(`/v1/organizations/${ORG}/files`);
    expect(url).not.toContain('employeeId');
  });

  it('sends the bytes straight to storage without the session cookie', async () => {
    const spy = mockFetch(200, {});
    const file = new File(['hello'], 'doc.txt', { type: 'text/plain' });
    await filesRepository.putBytes('https://storage.example/put', file);

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://storage.example/put');
    expect(init.method).toBe('PUT');
    expect(init.credentials).toBeUndefined();
  });

  /*
   * The API signs uploads with ServerSideEncryption AES256, so this header is part of the
   * signature rather than an extra. Dropping it makes every browser upload fail at the storage
   * provider — far from this file, and invisible to the API — which is exactly how it went
   * unnoticed before. Asserted here so the next edit cannot quietly remove it.
   */
  it('sends the server-side-encryption header the presigned URL signs', async () => {
    const spy = mockFetch(200, {});
    const file = new File(['hello'], 'doc.txt', { type: 'text/plain' });
    await filesRepository.putBytes('https://storage.example/put', file);

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ 'x-amz-server-side-encryption': 'AES256' });
  });
});
