import { NotificationMailService } from './notification-mail.service';

type Row = {
  id: string;
  title: string;
  body: string;
  module: string | null;
  createdAt: Date;
  recipient: { email: string; displayName: string; isActive: boolean; emailNotifications: boolean };
};

const now = new Date('2026-09-24T10:00:00Z');
const row = (id: string, overrides: Partial<Row['recipient']> = {}, ageMs = 60_000): Row => ({
  id,
  title: 'Leave approved',
  body: 'Your leave for 2 Oct 2026 was approved.',
  module: 'time-off',
  createdAt: new Date(now.getTime() - ageMs),
  recipient: {
    email: `${id}@t.test`,
    displayName: id,
    isActive: true,
    emailNotifications: true,
    ...overrides,
  },
});

function setup(rows: Row[]) {
  const marked: string[] = [];
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  const tx = {
    notification: {
      findMany: jest.fn().mockResolvedValue(rows),
      update: jest.fn(({ where }: { where: { id: string } }) => {
        marked.push(where.id);
        return Promise.resolve({});
      }),
    },
  };
  const database = {
    runSystem: jest.fn().mockResolvedValue([{ id: 'org', name: 'Northwind' }]),
    run: jest.fn((_context: unknown, callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const mail = {
    send: jest.fn((message: { to: string; subject: string; text: string }) => {
      sent.push(message);
      return Promise.resolve();
    }),
  };
  const config = { get: jest.fn(() => 'https://app.test/') };
  const service = new NotificationMailService(database as never, mail as never, config as never);
  return { service, marked, sent };
}

describe('notification email', () => {
  it('mails each fresh notification once, with a link to its screen', async () => {
    const { service, marked, sent } = setup([row('ada')]);
    expect(await service.sendPending(now)).toBe(1);
    expect(sent[0]?.to).toBe('ada@t.test');
    expect(sent[0]?.subject).toBe('Leave approved · Northwind');
    expect(sent[0]?.text).toContain('https://app.test/?module=time-off');
    expect(marked).toEqual(['ada']);
  });
  it('does not mail someone who turned email off, but marks it handled', async () => {
    const { service, marked, sent } = setup([row('bea', { emailNotifications: false })]);
    expect(await service.sendPending(now)).toBe(0);
    expect(sent).toHaveLength(0);
    expect(marked).toEqual(['bea']);
  });
  it('does not mail a deactivated account', async () => {
    const { service, sent } = setup([row('cal', { isActive: false })]);
    await service.sendPending(now);
    expect(sent).toHaveLength(0);
  });
  it('does not replay news older than a day', async () => {
    const { service, marked, sent } = setup([row('dev', {}, 2 * 24 * 60 * 60 * 1000)]);
    await service.sendPending(now);
    expect(sent).toHaveLength(0);
    expect(marked).toEqual(['dev']);
  });
});
