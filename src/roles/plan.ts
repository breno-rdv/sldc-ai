import type { RoleContext, RoleResult } from "../commands/router";
import type { GitHubModelsWorkflowClient } from "../llm/github-models";

interface ResearchSummary {
  task?: string;
  repository?: string;
  defaultBranch?: string;
  rootEntries: string[];
  includesReadme: boolean;
  includesStartScript: boolean;
  documentsExamples: boolean;
}

function extractFirstMatch(value: string, expression: RegExp): string | undefined {
  return value.match(expression)?.[1]?.trim();
}

function extractRootEntries(research: string): string[] {
  const block = research.match(/\*\*Root entries:\*\*\s*([\s\S]*?)(?:\n### |\n## |\n# |$)/)?.[1];
  if (!block) {
    return [];
  }

  return block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

function summarizeResearch(research: string): ResearchSummary {
  const rootEntries = extractRootEntries(research);

  return {
    task: extractFirstMatch(research, /^\s*Task:\s*(.+)$/m),
    repository: extractFirstMatch(research, /^\*\*Repository:\*\*\s*(.+)$/m),
    defaultBranch: extractFirstMatch(research, /^\*\*Default branch:\*\*\s*(.+)$/m),
    rootEntries,
    includesReadme: rootEntries.some((entry) => /^file:\s+readme(?:\.md)?$/i.test(entry)),
    includesStartScript: rootEntries.some((entry) => /^file:\s+start\.sh$/i.test(entry)),
    documentsExamples: /code example and a documentation explaining it/i.test(research),
  };
}

function selectRelevantAreas(summary: ResearchSummary): string[] {
  const taskTokens = new Set(
    (summary.task ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4),
  );

  const prioritized = summary.rootEntries.filter((entry) => {
    const normalizedEntry = entry.toLowerCase();
    if (taskTokens.size === 0) {
      return false;
    }

    for (const token of taskTokens) {
      if (normalizedEntry.includes(token)) {
        return true;
      }
    }

    if ((taskTokens.has("useeffect") || taskTokens.has("effect")) && normalizedEntry.includes("effect")) {
      return true;
    }

    if ((taskTokens.has("react") || taskTokens.has("hooks")) && normalizedEntry.includes("lifecycle")) {
      return true;
    }

    return false;
  });

  const defaults = summary.rootEntries.filter((entry) => entry.startsWith("dir: ")).slice(0, 3);
  const supportFiles = summary.rootEntries.filter((entry) => /^(file:\s+README(?:\.md)?|file:\s+start\.sh)$/i.test(entry));

  return [...new Set([...prioritized, ...supportFiles, ...defaults])].slice(0, 6);
}

function buildPlanSteps(summary: ResearchSummary, relevantAreas: string[]): string[] {
  const steps = [
    summary.repository
      ? `Inspect ${summary.repository} to confirm where examples matching this topic belong.`
      : "Inspect the repository to confirm where examples matching this topic belong.",
    relevantAreas.length > 0
      ? `Review the most relevant existing areas first: ${relevantAreas.join(", ")}.`
      : "Review the nearest existing example directories before introducing new files.",
    "Implement the new example using the repository's existing naming, numbering, and teaching style.",
  ];

  if (summary.documentsExamples) {
    steps.push("Add or update the companion explanation so the example includes both code and documentation.");
  }

  if (summary.includesReadme) {
    steps.push("Update README or related documentation only if it is used to index or explain the example set.");
  }

  if (summary.includesStartScript) {
    steps.push("Confirm the existing startup flow still exposes the new example if routing or navigation is driven from the project shell.");
  }

  return steps;
}

function buildPlanRisks(summary: ResearchSummary): string[] {
  const risks = [
    "The research snapshot only shows the repository root, so exact files still need confirmation before editing.",
    "The new example should match the style and sequencing of the existing teaching material.",
  ];

  if (summary.includesReadme || summary.includesStartScript) {
    risks.push("There may be project-level documentation or navigation wiring beyond the example folder itself.");
  }

  return risks;
}

export async function runPlan(
  input: RoleContext,
  llmClient: GitHubModelsWorkflowClient,
): Promise<RoleResult> {
  const researchSummary =
    input.artifacts["research.md"] ?? "research.md not loaded yet in this scaffold.";
  const specSummary = input.artifacts["spec.md"];
  const summary = summarizeResearch(researchSummary);
  const relevantAreas = selectRelevantAreas(summary);
  const steps = buildPlanSteps(summary, relevantAreas);
  const risks = buildPlanRisks(summary);

  const content = await llmClient.renderArtifact({
    title: "Implementation Plan",
    summary: summary.task
      ? `Implementation plan for ${summary.task}, grounded in the current research context.`
      : "Implementation plan grounded in the current research context.",
    sections: [
      {
        heading: "Goal",
        body: summary.task
          ? `Implement ${summary.task} in ${summary.repository ?? "the target repository"} using the existing project structure discovered during research.`
          : "Turn the approved research findings into an implementation sequence with bounded scope.",
      },
      {
        heading: "Repository Context",
        bullets: [
          summary.repository ? `Repository: ${summary.repository}` : undefined,
          summary.defaultBranch ? `Default branch: ${summary.defaultBranch}` : undefined,
          summary.task ? `Task: ${summary.task}` : undefined,
        ].filter((entry): entry is string => Boolean(entry)),
      },
      {
        heading: "Relevant Areas to Inspect",
        bullets:
          relevantAreas.length > 0
            ? relevantAreas
            : ["The research artifact does not identify exact files yet; inspect the nearest example directories first."],
      },
      {
        heading: "Implementation Steps",
        bullets: steps,
      },
      {
        heading: "Risks",
        bullets: risks,
      },
      {
        heading: "Research Notes",
        body: [
          summary.documentsExamples
            ? "Research indicates each topic in this repository is typically represented by both a code example and accompanying documentation."
            : undefined,
          summary.includesReadme
            ? "README is present at the repository root and may need to stay aligned with the example set."
            : undefined,
          summary.includesStartScript
            ? "A root start.sh script exists, so navigation or startup wiring may need confirmation after the example is added."
            : undefined,
        ]
          .filter((entry): entry is string => Boolean(entry))
          .join(" "),
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
