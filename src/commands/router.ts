import type { GitHubModelsWorkflowClient } from "../llm/github-models";
import { runCode } from "../roles/code";
import { runPlan } from "../roles/plan";
import { runResearch } from "../roles/research";
import { runSpec } from "../roles/spec";
import { runValidate } from "../roles/validate";

export type SupportedCommand =
  | "/research"
  | "/spec"
  | "/plan"
  | "/code"
  | "/validate";

export type ArtifactFileName = "research.md" | "spec.md" | "plan.md";

export type WorkflowArtifacts = Partial<Record<ArtifactFileName, string>>;

export type CommandSource = "clickup" | "github";

export interface RoleContext {
  source: CommandSource;
  taskBody: string;
  artifacts: WorkflowArtifacts;
}

export interface RoleResult {
  kind: "artifact" | "comment";
  fileName: ArtifactFileName;
  content: string;
  summary: string;
}

type RoleHandler = (
  input: RoleContext,
  llmClient: GitHubModelsWorkflowClient,
) => Promise<RoleResult>;

const handlers: Record<SupportedCommand, RoleHandler> = {
  "/research": runResearch,
  "/spec": runSpec,
  "/plan": runPlan,
  "/code": runCode,
  "/validate": runValidate,
};

const supportedCommands = Object.keys(handlers) as SupportedCommand[];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractCommand(commentBody: string): SupportedCommand | undefined {
  return supportedCommands.find((command) =>
    new RegExp(`(^|\\s)${escapeRegExp(command)}(\\s|$)`, "m").test(commentBody),
  );
}

export async function routeCommand(
  command: SupportedCommand,
  input: RoleContext,
  llmClient: GitHubModelsWorkflowClient,
): Promise<RoleResult> {
  return handlers[command](input, llmClient);
}
