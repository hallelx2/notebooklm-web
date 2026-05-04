/**
 * Sliding-window concurrent map.
 *
 * Why this beats `for (batch of chunks(items, N)) await Promise.all(batch)`:
 *
 *   With chunked Promise.all, the outer loop waits for every promise in
 *   the *current* batch to finish before starting the *next* batch. If
 *   one segment in the batch is much longer than the others, the rest
 *   of your worker pool sits idle. Long tail = wasted wall-clock time.
 *
 *   Sliding window keeps `concurrency` items in flight AT ALL TIMES.
 *   As soon as one finishes, the next item in the queue starts. Net
 *   throughput is the harmonic mean of the per-item time, not the max.
 *
 * Returns a result array in the same order as the input.
 *
 * `onProgress` is invoked once per item *as it completes*, not in input
 * order — useful for streaming UI updates ("3 of 12 done").
 */
export async function pMap<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  opts: {
    concurrency: number;
    onProgress?: (completed: number, total: number, index: number) => void;
    /**
     * Throw this from `fn` (or the cancellation check) to bail out early
     * without throwing AggregateError. The pool finishes any in-flight
     * work before rejecting the outer promise, so the caller can clean
     * up partial state if needed.
     */
    signal?: AbortSignal;
  },
): Promise<R[]> {
  const n = items.length;
  if (n === 0) return [];

  const concurrency = Math.max(1, Math.min(opts.concurrency, n));
  const results = new Array<R>(n);
  let nextIndex = 0;
  let completed = 0;
  let aborted: unknown = null;

  const checkAbort = () => {
    if (opts.signal?.aborted) {
      throw opts.signal.reason ?? new Error("aborted");
    }
  };

  const worker = async (): Promise<void> => {
    while (!aborted) {
      checkAbort();
      const i = nextIndex++;
      if (i >= n) return;
      try {
        results[i] = await fn(items[i] as T, i);
        completed++;
        opts.onProgress?.(completed, n, i);
      } catch (err) {
        // First failure latches `aborted` so other workers stop pulling
        // new items. We still let in-flight work finish naturally.
        aborted = err;
        throw err;
      }
    }
  };

  const workers = Array.from({ length: concurrency }, worker);
  // Use allSettled so we wait for every worker (in-flight tasks finish)
  // even after the first failure, then re-throw the *original* error
  // for clean stacktraces.
  const settled = await Promise.allSettled(workers);
  if (aborted) throw aborted;
  for (const r of settled) if (r.status === "rejected") throw r.reason;
  return results;
}
