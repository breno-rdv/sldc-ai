import type { RoleContext, RoleResult } from "../commands/router";
import type { GitHubModelsWorkflowClient } from "../llm/github-models";

export async function runValidate(
  input: RoleContext,
  llmClient: GitHubModelsWorkflowClient,
): Promise<RoleResult> {
  const content = await llmClient.renderComment({
    role: "Validate Agent",
    objective: "Check acceptance criteria, surface gaps, and outline follow-up tests.",
    inputs: [
      input.artifacts["spec.md"] ?? "spec.md not loaded yet in this scaffold.",
      input.taskBody,
    ],
  });

  return {
    kind: "comment",
    fileName: "plan.md",
    content,
    summary: "Validation step routed successfully.",
  };
}
