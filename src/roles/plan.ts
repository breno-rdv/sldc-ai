import type { RoleContext, RoleResult } from "../commands/router";
import type { GitHubModelsWorkflowClient } from "../llm/github-models";

export async function runPlan(
  input: RoleContext,
  llmClient: GitHubModelsWorkflowClient,
): Promise<RoleResult> {
  const specSummary = input.artifacts["spec.md"] ?? "spec.md not loaded yet in this scaffold.";

  const content = await llmClient.renderArtifact({
    title: "Implementation Plan",
    summary: "Planning artifact generated from the current specification.",
    sections: [
      {
        heading: "Goal",
        body: "Turn the approved specification into an implementation sequence with bounded scope.",
      },
      {
        heading: "Files to Modify",
        bullets: [
          "src/server.ts",
          "src/commands/router.ts",
          "src/roles/*",
          "src/github/pr.ts",
          "src/llm/github-models.ts",
        ],
      },
      {
        heading: "Steps",
        bullets: [
          "Confirm spec completeness.",
          "Limit edits to planned files.",
          "Generate code changes for the approved scope.",
          "Run validation before handoff.",
        ],
      },
      {
        heading: "Risks",
        bullets: [
          "Missing repository context can lead to incomplete plans.",
          "Artifact synchronization with GitHub is still placeholder-only.",
        ],
      },
      {
        heading: "Spec Input",
        body: specSummary,
      },
      {
        heading: "Current Trigger",
        body: input.taskBody,
      },
    ],
  });

  return {
    kind: "artifact",
    fileName: "plan.md",
    content,
    summary: "Plan artifact scaffolded successfully.",
  };
}
