/**
 * Changes made while offline, kept in IndexedDB on this device until they
 * sync. Each op has an id created here, so syncing twice is harmless.
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

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
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
  await tx("readwrite", (s) => s.put({ ...op, queuedAt: Date.now() }));
  notify();
  try {
    // `ready` never settles without an active worker (development), so check first.
    const reg = navigator.serviceWorker?.controller ? await navigator.serviceWorker.ready : null;
    // Background Sync (Chrome/Android) retries even if the app is closed.
    await (reg as ServiceWorkerRegistration & { sync?: { register: (t: string) => Promise<void> } })?.sync?.register("lf-offline-queue");
  } catch {}
}

export async function pending(): Promise<QueuedOp[]> {
  try {
    return (await tx("readonly", (s) => s.getAll())) as QueuedOp[];
  } catch {
    return [];
  }
}

let flushing = false;
/** Sends queued changes. Returns how many were applied. */
export async function flush(): Promise<{ applied: number; failed: number }> {
  if (flushing || isOffline()) return { applied: 0, failed: 0 };
  flushing = true;
  try {
    const ops = await pending();
    if (!ops.length) return { applied: 0, failed: 0 };
    const res = await fetch("/api/offline/replay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ops }) });
    if (!res.ok) return { applied: 0, failed: 0 };
    const { results } = (await res.json()) as { results: { id: string; status: string }[] };
    let applied = 0;
    let failed = 0;
    for (const r of results) {
      // Applied or already applied: done. Failed (e.g. the account was deleted): drop it rather than retry forever.
      await tx("readwrite", (s) => s.delete(r.id));
      if (r.status === "failed") failed++;
      else applied++;
    }
    localTaskDone.clear(); // the refreshed page now shows the saved state
    notify();
    return { applied, failed };
  } catch {
    return { applied: 0, failed: 0 };
  } finally {
    flushing = false;
  }
}
