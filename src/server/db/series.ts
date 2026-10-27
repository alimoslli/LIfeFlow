/**
 * Runs async thunks one after another and returns their results as a tuple.
 * Use instead of Promise.all inside a transaction: a transaction holds a
 * single connection, which cannot run queries concurrently.
 */
export async function series<T extends unknown[]>(...fns: { [K in keyof T]: () => Promise<T[K]> }): Promise<T> {
  const out: unknown[] = [];
  for (const fn of fns as (() => Promise<unknown>)[]) out.push(await fn());
  return out as T;
}
