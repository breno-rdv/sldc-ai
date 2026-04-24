import type { RoleContext, RoleResult } from "../commands/router";
import type { GitHubModelsWorkflowClient } from "../llm/github-models";

export async function runCode(
  input: RoleContext,
  llmClient: GitHubModelsWorkflowClient,
): Promise<RoleResult> {
  const implementationOutline = await llmClient.renderComment({
    role: "Code Agent",
    objective: "Prepare code changes that follow the approved specification and plan.",
    inputs: [
      input.artifacts["spec.md"] ?? "spec.md not loaded yet in this scaffold.",
      input.artifacts["plan.md"] ?? "plan.md not loaded yet in this scaffold.",
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
