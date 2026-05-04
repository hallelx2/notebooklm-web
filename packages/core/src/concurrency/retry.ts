/**
 * Retry an async operation with exponential backoff + optional jitter.
 *
 * Defaults are tuned for "transient API failure" — three attempts with
 * 500ms / 1s / 2s waits between, plus 0–250ms of jitter to avoid
 * thundering-herd retries when many segments fail at the same moment
 * (e.g. a TTS server restart).
 *
 * `shouldRetry` lets the caller veto retries for errors that won't get
 * better on a re-run (auth failures, validation errors, etc.).
 */
export async function withRetry<R>(
  fn: (attempt: number) => Promise<R>,
  opts: {
    maxAttempts?: number;
    /** Initial backoff in ms; doubled on each subsequent retry. */
    baseDelayMs?: number;
    /** Random extra delay (0..jitterMs) added per attempt. */
    jitterMs?: number;
    /** Return false to skip retries for this error. */
    shouldRetry?: (err: unknown, attempt: number) => boolean;
    /** Fired *after* a failure when another retry is queued. */
    onRetry?: (err: unknown, attempt: number, nextDelayMs: number) => void;
    /** External cancel source — checked between attempts. */
    signal?: AbortSignal;
  } = {},
): Promise<R> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelay = opts.baseDelayMs ?? 500;
  const jitter = opts.jitterMs ?? 250;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (opts.signal?.aborted) {
      throw opts.signal.reason ?? new Error("aborted before attempt");
    }
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (opts.shouldRetry && !opts.shouldRetry(err, attempt)) throw err;
      if (attempt >= maxAttempts) throw err;
      const backoff =
        baseDelay * 2 ** (attempt - 1) + Math.floor(Math.random() * jitter);
      opts.onRetry?.(err, attempt, backoff);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  // Unreachable, but TS wants a return.
  throw lastErr;
}
