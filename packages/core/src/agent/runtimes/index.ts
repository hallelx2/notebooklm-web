/**
 * Side-effect barrel: importing this module loads every runtime's
 * adapter and lets each one register itself with the harness.
 *
 * Currently registered:
 * - `./ai-sdk`            — default runtime, supports every task kind.
 *                           `available()` always returns true.
 * - `./claude-agent-sdk`  — Claude Code SDK with native sub-agents +
 *                           lifecycle hooks. Requires
 *                           `NOTEBOOKLM_ENABLE_CLAUDE_AGENT_SDK=1` env
 *                           flag AND a saved Anthropic credential
 *                           (or, on desktop, a logged-in `claude`
 *                           CLI — see TODO in that adapter).
 * - `./codex-cli`         — OpenAI Codex via the official
 *                           `@openai/codex-sdk` (which spawns the
 *                           `codex` CLI subprocess and exchanges
 *                           JSONL events). Chat-only today,
 *                           sandbox-locked + non-interactive so it
 *                           behaves like a chat assistant rather
 *                           than an autonomous agent.
 *
 * Deferred to a future release:
 * - `./copilot-cli`       — file present, not imported. The
 *                           `gh copilot` stable interface isn't a
 *                           good fit for our chat task shape today.
 *
 * Apps that want runtimes available should import this barrel exactly
 * once at boot — typically from the same place that calls
 * `bindCoreRuntime({ db })`.
 */
import "./ai-sdk";
import "./claude-agent-sdk";
import "./codex-cli";
// import "./copilot-cli"; // deferred — see header comment

export {};
