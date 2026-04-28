import type { RoleContext, RoleResult } from "../commands/router";
import type { GitHubModelsWorkflowClient } from "../llm/github-models";

export async function runCode(
  input: RoleContext,
  llmClient: GitHubModelsWorkflowClient,
): Promise<RoleResult> {
  const implementationContext =
    input.artifacts["plan.md"] ?? "plan.md not loaded yet in this scaffold.";
  const primaryScopeContext =
    input.artifacts["spec.md"]
    ?? input.artifacts["research.md"]
    ?? "Neither spec.md nor research.md is loaded yet in this scaffold.";

  const implementationOutline = await llmClient.renderComment({
    role: "Code Agent",
    objective: "Prepare code changes that follow the approved scope and implementation plan.",
    inputs: [
      primaryScopeContext,
      implementationContext,
      input.taskBody,
    ],
  });

  return {
    kind: "comment",
    fileName: "plan.md",
    content: implementationOutline,
    summary: "Code step routed. Real diff application is intentionally left as an MVP placeholder.",
  };
}
