import { OFFLINE_BATCH_MAX } from "./offline-limits";
import { applyOutcome, nextSeq, orderOps, ownedBy, readyOps, classifyHttp, type OpLike, type ReplayOutcome } from "./offline-queue-logic";

/**
 * Changes made while offline, kept in IndexedDB on this device until they
 * sync. Each op has an id created here, so syncing twice is harmless. Each is
 * stamped with its creation order and the account that made it; it is sent in
 * that order, only while that account is signed in, kept through temporary
 * failures, and kept as "failed" (to retry or discard) when the server refuses it.
 */
export type QueuedOp =
  | {
      kind: "task.create";
      id: string;
      data: { title: string; dueDate?: string | null; dueTime?: string | null; priority?: "low" | "medium" | "high" | "urgent" };
    }
  | { kind: "task.status"; id: string; data: { taskId: string; done: boolean } }
  | { kind: "transaction.create"; id: string; data: { accountId: string; amountCents: number; description: string; date: string } }
  | { kind: "shift.create"; id: string; data: { employerId: string; date: string; startTime: string; endTime: string; breakMinutes?: number } };

const DB = "lifeflow-offline";
const STORE = "ops";
type Stored = QueuedOp & OpLike;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => {
      // If another tab wants to delete or upgrade the database (sign-out), let go of it.
      r.result.onversionchange = () => r.result.close();
      resolve(r.result);
    };
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error("The offline store is busy."));
  });
}

const wrap = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

/** Runs one transaction, resolves only once it has been committed, and always closes the handle. */
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      let result: T;
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error ?? new Error("The offline store was interrupted."));
      fn(t.objectStore(STORE)).then((r) => (result = r), reject);
    });
  } finally {
    db.close();
  }
}

const allOps = () => tx("readonly", (s) => wrap(s.getAll() as IDBRequest<Stored[]>));

// The signed-in account, set by the app shell. Changes are stamped with it and only sent while it is still the one signed in.
let owner: string | null = null;
export function setQueueOwner(userId: string | null) {
  owner = userId;
}

export const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/** A server action that couldn't reach the server (offline, or the connection dropped mid-request). */
export const isNetworkError = (e: unknown) => e instanceof TypeError || (e instanceof Error && /fetch|network|load failed/i.test(e.message));

// To-dos ticked while offline: shown as done on this device until the change syncs.
const localTaskDone = new Map<string, boolean>();
const notify = () => window.dispatchEvent(new Event("lf:queue-changed"));
export const offlineTaskDone = (taskId: string) => localTaskDone.get(taskId);
export function subscribeQueue(cb: () => void) {
  window.addEventListener("lf:queue-changed", cb);
  return () => window.removeEventListener("lf:queue-changed", cb);
}

/** Marks a to-do done or not done on this device and queues the change. */
export async function queueTaskStatus(taskId: string, done: boolean) {
  localTaskDone.set(taskId, done);
  await enqueue({ kind: "task.status", id: crypto.randomUUID(), data: { taskId, done } });
}

export async function enqueue(op: QueuedOp) {
  // The order number is worked out inside the same transaction that saves it, so two tabs can't share one.
  await tx("readwrite", async (s) => {
    const existing = await wrap(s.getAll() as IDBRequest<Stored[]>);
    await wrap(s.put({ ...op, queuedAt: Date.now(), seq: nextSeq(existing, Date.now()), ...(owner ? { userId: owner } : {}) }));
  });
  notify();
  try {
    // `ready` never settles without an active worker (development), so check first.
    const reg = navigator.serviceWorker?.controller ? await navigator.serviceWorker.ready : null;
    // Background Sync (Chrome/Android) retries even if the app is closed.
    await (reg as ServiceWorkerRegistration & { sync?: { register: (t: string) => Promise<void> } })?.sync?.register("lf-offline-queue");
  } catch {}
}

/** This account's changes still waiting to be saved (not the ones that failed, and never another account's). */
export async function pending(): Promise<QueuedOp[]> {
  try {
    return orderOps(ownedBy(await allOps(), owner ?? "")).filter((o) => o.state !== "failed") as QueuedOp[];
  } catch {
    return [];
  }
}

/** This account's changes the server refused. They stay here until the person retries or discards them. */
export async function failedOps(): Promise<QueuedOp[]> {
  try {
    return orderOps(ownedBy(await allOps(), owner ?? "")).filter((o) => o.state === "failed") as QueuedOp[];
  } catch {
    return [];
  }
}

/** Puts failed changes back in the queue and sends them now. */
export async function retryFailed() {
  const ids = new Set((await failedOps()).map((o) => o.id));
  await tx("readwrite", async (s) => {
    for (const o of await wrap(s.getAll() as IDBRequest<Stored[]>))
      if (ids.has(o.id)) await wrap(s.put({ ...o, state: "pending", error: undefined, attempts: 0, nextTryAt: undefined }));
  });
  notify();
  return flush({ force: true });
}

/** Throws away this account's failed changes. */
export async function discardFailed() {
  const ids = (await failedOps()).map((o) => o.id);
  await tx("readwrite", async (s) => {
    for (const id of ids) await wrap(s.delete(id));
  });
  localTaskDone.clear();
  notify();
}

/** Saves what the server said about each change: saved ones go, refused ones are marked failed, temporary trouble backs off. */
async function record(sent: Stored[], results: ReplayOutcome[]) {
  const byId = new Map(results.map((r) => [r.id, r]));
  const now = Date.now();
  await tx("readwrite", async (s) => {
    for (const op of sent) {
      const next = applyOutcome(op, byId.get(op.id), now);
      if (next) await wrap(s.put(next));
      else await wrap(s.delete(op.id));
    }
  });
}

let flushing = false;
/** Sends this account's queued changes, oldest first, in batches the server accepts. Returns how many were saved or refused. */
export async function flush(opts: { force?: boolean } = {}): Promise<{ applied: number; failed: number }> {
  if (flushing || isOffline() || !owner) return { applied: 0, failed: 0 };
  flushing = true;
  let applied = 0;
  let failed = 0;
  const tried = new Set<string>(); // each change is sent at most once per run
  try {
    // Each round sends what is ready; a change that waited for an earlier one goes in the next round.
    for (let round = 0; round < 50; round++) {
      const all = await allOps();
      // Changes saved before accounts were recorded belong to the person signed in now.
      const unstamped = all.filter((o) => !o.userId);
      if (unstamped.length)
        await tx("readwrite", async (s) => {
          for (const o of unstamped) await wrap(s.put({ ...o, userId: owner }));
        });
      const ready = readyOps(all, owner, Date.now(), opts.force).filter((o) => !tried.has(o.id));
      if (!ready.length) break;
      const batch = ready.slice(0, OFFLINE_BATCH_MAX);
      batch.forEach((o) => tried.add(o.id));
      let res: Response;
      try {
        res = await fetch("/api/offline/replay", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId: owner, ops: batch.map((o) => ({ kind: o.kind, id: o.id, data: o.data })) }),
        });
      } catch {
        break; // no connection: try again when it's back
      }
      if (!res.ok) {
        if (classifyHttp(res.status) === "retry") await record(batch, []); // back off; nothing is deleted
        break; // signed out, or another account: keep everything
      }
      const { results } = (await res.json()) as { results: ReplayOutcome[] };
      await record(batch, results);
      for (const r of results) {
        if (r.status === "failed" && !r.retryable) failed++;
        else if (r.status !== "failed") applied++;
      }
    }
    localTaskDone.clear(); // the refreshed page now shows the saved state
    notify();
    return { applied, failed };
  } catch {
    return { applied, failed };
  } finally {
    flushing = false;
  }
}

/**
 * For sign-out: sends what can be sent, then deletes the database so the next
 * person sees nothing. Other open tabs let go of it (onversionchange); if one
 * still holds it we wait briefly rather than hang.
 */
export async function wipeOfflineDatabase(): Promise<void> {
  try {
    await flush();
  } catch {}
  await new Promise<void>((resolve) => {
    const done = () => resolve();
    const timer = setTimeout(done, 2000);
    const r = indexedDB.deleteDatabase(DB);
    r.onsuccess = r.onerror = () => {
      clearTimeout(timer);
      done();
    };
    // r.onblocked: another tab still has it open; it closes on versionchange and then success fires.
  });
}
