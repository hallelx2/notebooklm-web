/**
 * Side-effect barrel: importing this module loads every runtime's
 * adapter and lets each one register itself with the harness.
 *
 * Runtimes added in commit 1 (skeleton): none yet.
 * Runtimes added in commit 2 (ai-sdk runtime):       `./ai-sdk`
 * Runtimes added in commit 4 (claude-agent-sdk):     `./claude-agent-sdk`
 *
 * Apps that want runtimes available should import this barrel exactly
 * once at boot — typically from the same place that calls
 * `bindCoreRuntime({ db })`.
 */
export {};
