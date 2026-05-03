/**
 * Hooks barrel — every lifecycle hook the runtime registers via the
 * SDK's `hooks:` option. Each is either a top-level constant
 * (stateless) or a factory the runtime calls per task.
 *
 * Ordering matters when multiple hooks match the same event: they run
 * in registration order. The runtime registers stateful factories
 * (PreToolUse with config, PostToolUse with collector, UserPromptSubmit
 * with notebook context) AHEAD of the stateless logging hooks so a
 * deny decision short-circuits cleanly.
 */
export {
  type CitationCollector,
  makePostToolUseHook,
} from "./post-tool-use";
export { makePreToolUseHook } from "./pre-tool-use";
export { sessionEndHook } from "./session-end";
export { sessionStartHook } from "./session-start";
export { makeUserPromptSubmitHook } from "./user-prompt-submit";
