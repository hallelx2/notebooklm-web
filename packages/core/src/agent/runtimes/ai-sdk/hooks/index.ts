/**
 * Hooks barrel — small utilities that wrap or post-process AI SDK
 * stream output. Currently:
 *
 * - `makeCitationStreamer`: stateful extractor for `(chunk:UUID)`
 *   markers in streamed text, used by the `chat` task.
 *
 * Hooks are runtime-internal helpers; they are not part of the
 * harness's public API.
 */
export { makeCitationStreamer } from "./stream-citations";
