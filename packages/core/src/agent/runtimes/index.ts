/**
 * Side-effect barrel: importing this module loads every runtime's
 * adapter and lets each one register itself with the harness.
 *
 * Currently registered:
 * - `./ai-sdk`           — default runtime, supports every task kind.
 *                          `available()` always returns true.
 * - `./claude-agent-sdk` — opt-in runtime backed by the Claude Code
 *                          SDK with native sub-agents + lifecycle
 *                          hooks. `available()` requires the user to
 *                          have an Anthropic credential AND the
 *                          `NOTEBOOKLM_ENABLE_CLAUDE_AGENT_SDK=1` env
 *                          flag, so the harness silently falls back
 *                          to ai-sdk when the SDK isn't deployable
 *                          (e.g. Vercel serverless).
 *
 * Apps that want runtimes available should import this barrel exactly
 * once at boot — typically from the same place that calls
 * `bindCoreRuntime({ db })`.
 */
import "./ai-sdk";
import "./claude-agent-sdk";

export {};
