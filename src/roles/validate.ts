import type { RoleContext, RoleResult } from "../commands/router";
import type { GitHubModelsWorkflowClient } from "../llm/github-models";

export async function runValidate(
  input: RoleContext,
  llmClient: GitHubModelsWorkflowClient,
): Promise<RoleResult> {
  const validationScope =
    input.artifacts["code.md"]
    ?? input.artifacts["spec.md"]
    ?? input.artifacts["plan.md"]
    ?? input.artifacts["research.md"]
    ?? "No workflow artifact is loaded yet in this scaffold.";

  const content = await llmClient.renderComment({
    role: "Validate Agent",
    objective: "Check acceptance criteria, surface gaps, and outline follow-up tests.",
    inputs: [
      validationScope,
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
