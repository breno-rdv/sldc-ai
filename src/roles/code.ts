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

  const implementationOutline = await llmClient.renderArtifact({
    title: "Code Implementation Draft",
    summary: "Implementation artifact generated from the approved scope and plan.",
    sections: [
      {
        heading: "Goal",
        body: "Translate the approved workflow context into concrete repository changes.",
      },
      {
        heading: "Scope Context",
        body: primaryScopeContext,
      },
      {
        heading: "Implementation Plan Input",
        body: implementationContext,
      },
      {
        heading: "Requested Command",
        body: input.taskBody,
      },
      {
        heading: "Expected Deliverables",
        bullets: [
          "List the repository files or directories that should be added or updated.",
          "Describe the concrete code or documentation changes required in each location.",
          "Call out unknowns that still need manual repository inspection before editing exact files.",
        ],
      },
    ],
  });

  return {
    kind: "artifact",
    fileName: "code.md",
    content: implementationOutline,
    summary: "Code implementation artifact generated successfully.",
  };
}
