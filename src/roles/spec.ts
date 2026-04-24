import type { RoleContext, RoleResult } from "../commands/router";
import type { GitHubModelsWorkflowClient } from "../llm/github-models";

export async function runSpec(
  input: RoleContext,
  llmClient: GitHubModelsWorkflowClient,
): Promise<RoleResult> {
  const researchSummary =
    input.artifacts["research.md"] ?? "research.md not loaded yet in this scaffold.";

  const content = await llmClient.renderArtifact({
    title: "Specification",
    summary: "Spec artifact generated from prior research inputs.",
    sections: [
      {
        heading: "Feature",
        body: "Define the requested behavior as a concrete, reviewable feature.",
      },
      {
        heading: "Requirements",
        bullets: [
          "Translate research findings into explicit implementation requirements.",
          "Capture API behavior and operational constraints.",
          "Keep the spec as the single source of truth for later steps.",
        ],
      },
      {
        heading: "Acceptance Criteria",
        bullets: [
          "[ ] Behavior is described in a testable way.",
          "[ ] Edge cases are listed before coding begins.",
          "[ ] The plan phase can proceed without ambiguity.",
        ],
      },
      {
        heading: "Research Input",
        body: researchSummary,
      },
      {
        heading: "Current Trigger",
        body: input.taskBody,
      },
    ],
  });

  return {
    kind: "artifact",
    fileName: "spec.md",
    content,
    summary: "Specification artifact scaffolded successfully.",
  };
}
