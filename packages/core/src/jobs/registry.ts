/**
 * In-process registry for long-running jobs that need cooperative
 * cancellation.
 *
 * Why in-process is fine here:
 *   The desktop app runs a single Node process. The "queue" of
 *   in-flight studio jobs lives in this Map. If the process dies
 *   mid-job, the row is reaped on next launch by stub-adapter's
 *   `reapOrphanedJobs`. No external Redis / queue infrastructure
 *   needed for the single-user case.
 *
 *   For the deployed web app (Vercel etc.) this Map is per-instance
 *   and won't survive a serverless cold-start. That's an acceptable
 *   trade-off — audio overview on Vercel is already constrained by
 *   serverless function timeouts and isn't really a long-running-job
 *   use case there.
 *
 * Cancellation is *cooperative*: the worker has to check
 * `handle.cancelled` (or `handle.signal.aborted`) at safe points
 * (between segments, between LLM tokens, etc.). External code
 * doesn't get to forcibly kill a Promise.
 */

export type JobHandle = {
  readonly id: string;
  /** Mutable flag. Workers check this between iterations. */
  cancelled: boolean;
  /** AbortSignal-shaped flag for fetch / abortable libraries. */
  readonly signal: AbortSignal;
  /** ms since epoch — useful for diagnostics. */
  readonly startedAt: number;
};

const jobs = new Map<string, JobHandle & { _ctrl: AbortController }>();

/**
 * Register a new in-flight job. Returns a handle the worker should
 * pass through to its inner loop and check periodically.
 *
 * Idempotent: if a job with the same id already exists (shouldn't, but
 * defensively) the existing handle is returned.
 */
export function registerJob(id: string): JobHandle {
  const existing = jobs.get(id);
  if (existing) return existing;
  const ctrl = new AbortController();
  const handle = {
    id,
    cancelled: false,
    signal: ctrl.signal,
    startedAt: Date.now(),
    _ctrl: ctrl,
  };
  jobs.set(id, handle);
  return handle;
}

/** Worker calls this in its `finally` block. */
export function unregisterJob(id: string): void {
  jobs.delete(id);
}

/**
 * Flip the cancel flag for a job. Returns true if the job was found and
 * was still running, false if no such job (already finished, never
 * existed, or running on a different process).
 */
export function cancelJob(id: string): boolean {
  const handle = jobs.get(id);
  if (!handle) return false;
  if (handle.cancelled) return true;
  handle.cancelled = true;
  handle._ctrl.abort(new JobCancelledError(id));
  return true;
}

export function isJobRegistered(id: string): boolean {
  return jobs.has(id);
}

/**
 * Snapshot of running jobs — handy for diagnostics endpoints (or the
 * `/api/admin/jobs` endpoint we don't have yet).
 */
export function listJobs(): { id: string; runtimeMs: number; cancelled: boolean }[] {
  const now = Date.now();
  return [...jobs.values()].map((h) => ({
    id: h.id,
    runtimeMs: now - h.startedAt,
    cancelled: h.cancelled,
  }));
}

export class JobCancelledError extends Error {
  constructor(public readonly jobId: string) {
    super(`Job ${jobId} was cancelled`);
    this.name = "JobCancelledError";
  }
}

export function isCancellation(err: unknown): err is JobCancelledError {
  return err instanceof JobCancelledError;
}
