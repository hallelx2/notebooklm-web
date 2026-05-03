/**
 * Side-effect barrel: importing this module loads every runtime's
 * adapter and lets each one register itself with the harness.
 *
 * Currently registered:
 * - `./ai-sdk`            — the default runtime, supports every task kind
 *
 * Pending:
 * - `./claude-agent-sdk`  — added in commit 4
 *
 * Apps that want runtimes available should import this barrel exactly
 * once at boot — typically from the same place that calls
 * `bindCoreRuntime({ db })`.
 */
import "./ai-sdk";

export {};
