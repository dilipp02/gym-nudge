import 'fake-indexeddb/auto';
import { createStore } from 'idb-keyval';
import { describe, expect, it } from 'vitest';
import { ApiError, OfflineError, type Method } from '../api/client';
import { createOutbox } from './outbox';

let n = 0;
const freshStore = () => createStore(`test-db-${++n}`, 'outbox');

function fakeServer() {
  let online = true;
  const received: Array<{ method: Method; path: string; body: unknown }> = [];
  const reject = new Map<string, number>();
  return {
    received,
    setOnline: (v: boolean) => (online = v),
    rejectPath: (path: string, status: number) => reject.set(path, status),
    transport: async (method: Method, path: string, body?: unknown) => {
      if (!online) throw new OfflineError();
      const status = reject.get(path);
      if (status) throw new ApiError(status, `rejected ${status}`);
      received.push({ method, path, body });
      return { ok: true, path };
    },
  };
}

describe('offline outbox', () => {
  it('sends straight through when online', async () => {
    const server = fakeServer();
    const box = createOutbox({ transport: server.transport, store: freshStore() });
    const res = await box.send('POST', '/checkin', { at: 'x' }, 'Check-in');
    expect(res).toEqual({ status: 'sent', data: { ok: true, path: '/checkin' } });
    expect(await box.pending()).toEqual([]);
  });

  it('queues while offline, then replays once, in order', async () => {
    const server = fakeServer();
    const box = createOutbox({ transport: server.transport, store: freshStore() });
    server.setOnline(false);
    expect((await box.send('POST', '/checkin', { at: '1' }, 'Check-in')).status).toBe('queued');
    expect((await box.send('POST', '/sessions', { id: 's1' }, 'Pull session')).status).toBe(
      'queued',
    );
    expect((await box.pending()).map((w) => w.label)).toEqual(['Check-in', 'Pull session']);

    // Still offline: nothing happens, nothing lost.
    expect(await box.flush()).toEqual({ sent: 0, failed: 0 });
    expect(await box.pending()).toHaveLength(2);

    server.setOnline(true);
    const [a, b] = await Promise.all([box.flush(), box.flush()]); // concurrent calls share one run
    expect(a).toEqual({ sent: 2, failed: 0 });
    expect(b).toBe(a);
    expect(server.received.map((r) => r.path)).toEqual(['/checkin', '/sessions']);
    expect(await box.pending()).toEqual([]);
    expect(await box.flush()).toEqual({ sent: 0, failed: 0 });
    expect(server.received).toHaveLength(2);
  });

  it('parks writes the server rejects for good, keeps going with the rest', async () => {
    const server = fakeServer();
    const box = createOutbox({ transport: server.transport, store: freshStore() });
    server.setOnline(false);
    await box.send('POST', '/sessions', { id: 'old' }, 'Old session');
    await box.send('POST', '/lights-out', {}, 'Lights out');
    server.setOnline(true);
    server.rejectPath('/sessions', 409);
    expect(await box.flush()).toEqual({ sent: 1, failed: 1 });
    const failed = await box.failed();
    expect(failed.map((f) => [f.label, f.error])).toEqual([['Old session', 'rejected 409']]);
    await box.dismissFailed(failed[0]!.key);
    expect(await box.failed()).toEqual([]);
  });

  it('stops at a server error and retries later without reordering', async () => {
    const server = fakeServer();
    const box = createOutbox({ transport: server.transport, store: freshStore() });
    server.setOnline(false);
    await box.send('POST', '/sessions', { id: 's1' }, 'Session');
    await box.send('POST', '/lights-out', {}, 'Lights out');
    server.setOnline(true);
    server.rejectPath('/sessions', 503);
    expect(await box.flush()).toEqual({ sent: 0, failed: 0 });
    expect(await box.pending()).toHaveLength(2);
  });

  it('server errors on a live send are thrown, not queued', async () => {
    const server = fakeServer();
    const box = createOutbox({ transport: server.transport, store: freshStore() });
    server.rejectPath('/sessions', 400);
    await expect(box.send('POST', '/sessions', {}, 'Session')).rejects.toBeInstanceOf(ApiError);
    expect(await box.pending()).toEqual([]);
  });
});
