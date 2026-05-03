/**
 * Sub-agent factory barrel. Each export returns an `AgentDefinition`
 * that the runtime adapter wires into the SDK's `agents:` option.
 * The coordinator (the main agent) invokes them via the `Task` tool.
 *
 * Why factories rather than top-level constants: the prompts depend
 * on the user's research query (or other task input) so we build
 * fresh definitions per call. Cheap allocation; matches the SDK's
 * stateless agent model.
 */
export { reportWriterAgent } from "./report-writer";
export { researchPlannerAgent } from "./research-planner";
export { selfCriticAgent } from "./self-critic";
export { sourceSummarizerAgent } from "./source-summarizer";
