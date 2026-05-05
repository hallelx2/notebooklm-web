/**
 * GitHub Copilot CLI (`gh copilot`) runtime — STUB.
 *
 * Why this is a stub today:
 *
 * `gh copilot` ships two stable subcommands — `suggest` (one-line
 * shell command suggestions) and `explain` (one-paragraph command
 * explanations). Neither is a freeform chat — they're keyed off a
 * narrow task vocabulary that doesn't map to our `chat`, `research`,
 * or `studio` tasks.
 *
 * GitHub also has `gh copilot chat` in beta-ish form on some
 * accounts, but the interface (interactive REPL, no scriptable
 * one-shot mode) is unsuitable for the harness shape: we can't
 * easily pipe a single prompt in, get a single answer out, and
 * exit cleanly the way Codex / Claude Code support.
 *
 * Until either (a) `gh copilot` ships a stable scriptable chat
 * mode, or (b) we add a `gh-copilot-shell-suggest` task kind that
 * fits its capability, the right behaviour is to register the
 * adapter (so the runtime ID is "real") but have `supports()`
 * return false for everything. The harness's preference chain
 * walks past us automatically and the user falls through to the
 * next runtime in their preference list (typically ai-sdk).
 *
 * The wizard surfaces this honestly: when `gh copilot` is detected,
 * the card says "Detected — limited chat support today, used as a
 * fallback for shell suggestions only" with the Copilot card
 * explicitly flagged not-recommended unless `claude` and `codex`
 * are both unavailable.
 *
 * Reactivating this adapter is mostly: implement `runChat()` over
 * `gh copilot chat`'s eventual stable interface and flip
 * `supports()` to return true for `task.kind === "chat"`.
 */
import { registerAdapter } from "../../harness";
import type {
  AgentAdapter,
  AgentContext,
  AgentEvent,
  AgentTask,
} from "../../types";

export const copilotCliAdapter: AgentAdapter = {
  id: "copilot-cli",

  async available(_ctx: AgentContext): Promise<boolean> {
    // Even if `gh copilot` is installed, we don't claim availability
    // because supports() is false for every task we route. Claiming
    // availability without supports() would just churn the harness's
    // selection loop with no benefit.
    return false;
  },

  supports(_task: AgentTask): boolean {
    return false;
  },

  run(_task: AgentTask, _ctx: AgentContext): AsyncIterable<AgentEvent> {
    return (async function* () {
      yield {
        type: "error",
        message:
          "copilot-cli runtime is registered as a placeholder but doesn't implement any task kind yet. " +
          "Pick another runtime in Settings → Models.",
      };
    })();
  },
};

registerAdapter(copilotCliAdapter);
