// Offline outbox (plan 4.3): writes that fail for lack of network are kept in
// IndexedDB and replayed in order once the app is back online. Every queued
// write is safe to repeat (sessions upsert by client id; check-in keeps the
// first time; rest/walk/commit are plain sets).
import { createStore, del, entries, set, type UseStore } from 'idb-keyval';
import { ApiError, OfflineError, request, type Method } from '../api/client';

export interface QueuedWrite {
  key: string;
  seq: number;
  method: Method;
  path: string;
  body: unknown;
  queuedAt: string;
  /** Short description for the UI, e.g. "Pull session". */
  label: string;
}

export interface FailedWrite extends QueuedWrite {
  error: string;
}

export type Transport = (method: Method, path: string, body?: unknown) => Promise<unknown>;

export type SendResult<T> = { status: 'sent'; data: T } | { status: 'queued' };

export function createOutbox(opts: { transport?: Transport; store?: UseStore } = {}) {
  const transport = opts.transport ?? request;
  const store = opts.store ?? createStore('gym-nudge', 'outbox');
  const failedStore = opts.store ?? createStore('gym-nudge-failed', 'failed');
  const listeners = new Set<() => void>();
  let counter = 0;
  let flushing: Promise<{ sent: number; failed: number }> | null = null;

  const notify = () => listeners.forEach((l) => l());

  async function pending(): Promise<QueuedWrite[]> {
    const all = await entries<string, QueuedWrite>(store);
    return all
      .map(([, v]) => v)
      .filter((v) => v.seq !== undefined && !('error' in v))
      .sort((a, b) => a.seq - b.seq);
  }

  async function failed(): Promise<FailedWrite[]> {
    const all = await entries<string, FailedWrite>(failedStore);
    return all.map(([, v]) => v).filter((v) => 'error' in v);
  }

  async function enqueue(method: Method, path: string, body: unknown, label: string) {
    const seq = Date.now() * 1000 + (counter++ % 1000);
    const key = `w-${seq}`;
    await set(
      key,
      {
        key,
        seq,
        method,
        path,
        body,
        queuedAt: new Date().toISOString(),
        label,
      } satisfies QueuedWrite,
      store,
    );
    notify();
  }

  /** Try now; if there's no network, queue it. Server errors still throw. */
  async function send<T>(
    method: Method,
    path: string,
    body: unknown,
    label: string,
  ): Promise<SendResult<T>> {
    try {
      return { status: 'sent', data: (await transport(method, path, body)) as T };
    } catch (err) {
      if (err instanceof OfflineError) {
        await enqueue(method, path, body, label);
        return { status: 'queued' };
      }
      throw err;
    }
  }

  async function doFlush() {
    let sent = 0;
    let failedCount = 0;
    for (const w of await pending()) {
      try {
        await transport(w.method, w.path, w.body);
        await del(w.key, store);
        sent++;
      } catch (err) {
        if (err instanceof OfflineError) break; // still offline; try later
        if (
          err instanceof ApiError &&
          err.status >= 400 &&
          err.status < 500 &&
          err.status !== 408 &&
          err.status !== 429
        ) {
          // The server rejected it (e.g. day locked): it will never succeed. Park it for the UI.
          const failedKey = `failed:${w.key}`;
          await set(
            failedKey,
            { ...w, key: failedKey, error: err.message } satisfies FailedWrite,
            failedStore,
          );
          await del(w.key, store);
          failedCount++;
          continue;
        }
        break; // server trouble: keep order, retry later
      }
    }
    notify();
    return { sent, failed: failedCount };
  }

  /** Replay queued writes in order. Concurrent calls share one run. */
  function flush() {
    flushing ??= doFlush().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  async function dismissFailed(key: string) {
    await del(key, failedStore);
    notify();
  }

  function subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }

  return { send, flush, pending, failed, dismissFailed, subscribe };
}

export type Outbox = ReturnType<typeof createOutbox>;

let shared: Outbox | null = null;
export function outbox(): Outbox {
  shared ??= createOutbox();
  return shared;
}

/** Flush on startup, when the network returns, and when the app comes back to the foreground. */
export function startOutboxSync(box: Outbox = outbox()) {
  const run = () => void box.flush();
  run();
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run();
  });
}
