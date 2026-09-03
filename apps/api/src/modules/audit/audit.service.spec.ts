import { jsonSnapshot } from './audit.service';

describe('jsonSnapshot', () => {
  it('serializes bigint values for audit JSON', () => {
    expect(jsonSnapshot({ byteSize: 22_617n })).toEqual({ byteSize: 22_617 });
  });
});
