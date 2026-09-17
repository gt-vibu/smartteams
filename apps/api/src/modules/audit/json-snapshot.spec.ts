import { jsonSnapshot } from './audit.service';

/**
 * Audit snapshots.
 *
 * `JSON.stringify` throws on BigInt rather than skipping it, and three columns in this schema are
 * BigInt. Auditing any of them crashed the request — which is exactly how file upload stayed
 * broken: object storage was unconfigured, so the route failed earlier for an unrelated reason
 * and the real fault was never reached.
 */
describe('jsonSnapshot', () => {
  it('serialises a BigInt rather than throwing', () => {
    // FileObject.byteSize is the one that broke upload.
    expect(() => jsonSnapshot({ byteSize: 2048n })).not.toThrow();
    expect(jsonSnapshot({ byteSize: 2048n })).toEqual({ byteSize: '2048' });
  });

  it('keeps a BigInt exact beyond the safe-integer range', () => {
    // A Number conversion would lose the last digits here without any error.
    const huge = 9_007_199_254_740_993n;
    expect(jsonSnapshot({ signCount: huge })).toEqual({ signCount: '9007199254740993' });
  });

  it('reaches a BigInt nested inside the record', () => {
    expect(jsonSnapshot({ file: { versions: [{ byteSize: 10n }] } })).toEqual({
      file: { versions: [{ byteSize: '10' }] },
    });
  });

  it('leaves every other value alone', () => {
    const value = { name: 'x', count: 3, ok: true, missing: null, at: new Date(0) };
    expect(jsonSnapshot(value)).toEqual({
      name: 'x',
      count: 3,
      ok: true,
      missing: null,
      at: '1970-01-01T00:00:00.000Z',
    });
  });
});
