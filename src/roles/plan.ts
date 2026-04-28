import type { RoleContext, RoleResult } from "../commands/router";
import type { GitHubModelsWorkflowClient } from "../llm/github-models";

export async function runPlan(
  input: RoleContext,
  llmClient: GitHubModelsWorkflowClient,
): Promise<RoleResult> {
  const researchSummary =
    input.artifacts["research.md"] ?? "research.md not loaded yet in this scaffold.";
  const specSummary = input.artifacts["spec.md"];

  const content = await llmClient.renderArtifact({
    title: "Implementation Plan",
    summary: "Planning artifact generated from the current research context.",
    sections: [
      {
        heading: "Goal",
        body: "Turn the approved research findings into an implementation sequence with bounded scope.",
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
          "Confirm the research context is sufficient to plan the work.",
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
        heading: "Research Input",
        body: researchSummary,
      },
      specSummary
        ? {
            heading: "Supporting Spec Input",
            body: specSummary,
          }
        : undefined,
      {
        heading: "Current Trigger",
        body: input.taskBody,
      },
    ].filter((section): section is NonNullable<typeof section> => Boolean(section)),
  });

  return {
    kind: "artifact",
    fileName: "plan.md",
    content,
    summary: "Plan artifact scaffolded successfully.",
  };
}
