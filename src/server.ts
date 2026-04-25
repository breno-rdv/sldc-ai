import "dotenv/config"
import express, { type Request, type Response } from "express";

import { parseClickUpGitHubContext } from "./clickup/github-context";
import {
  extractCommand,
  routeCommand,
  type CommandSource,
  type WorkflowArtifacts,
} from "./commands/router";
import {
  GitHubPullRequestClient,
  type PullRequestContext,
  type RepositoryContext,
} from "./github/pr";
import { GitHubModelsWorkflowClient } from "./llm/github-models";

interface ClickUpWebhookPayload {
  task?: {
    id?: string;
    name?: string;
    description?: string;
  };
}

interface GitHubIssueCommentWebhookPayload {
  action: string;
  comment?: {
    body?: string;
  };
  issue?: {
    number?: number;
    pull_request?: {
      url: string;
    };
  };
  repository?: {
    name?: string;
    owner?: {
      login?: string;
    };
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function buildResearchBranchName(taskName: string, taskId?: string): string {
  const taskSegment = slugify(taskName) || "task";
  const idSegment = taskId ? slugify(taskId) : `${Date.now()}`;
  return `ai/research/${taskSegment}-${idSegment}`;
}

function buildPullRequestBody(taskName: string, taskDescription: string): string {
  return [
    "## AI workflow bootstrap",
    "",
    `This pull request was created from a ClickUp webhook for **${taskName}**.`,
    "",
    "### Task description",
    taskDescription,
    "",
    "### Workflow",
    "- Review `research.md`.",
    "- When approved, comment `/plan` on this PR.",
    "- After the plan is approved, proceed with `/code`.",
  ].join("\n");
}

const app = express();
const port = Number(process.env.PORT ?? 3000);
const githubClient = new GitHubPullRequestClient({
  token: process.env.GITHUB_TOKEN,
  apiBaseUrl: process.env.GITHUB_API_URL,
});
const llmClient = new GitHubModelsWorkflowClient({
  token: process.env.GITHUB_TOKEN,
  apiBaseUrl: process.env.GITHUB_MODELS_API_URL,
  model: process.env.GITHUB_MODEL,
});
const githubOwner = process.env.GITHUB_OWNER;

app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_request: Request, response: Response) => {
  response.json({
    ok: true,
    integrations: {
      github: githubClient.isConfigured(),
      githubOwner: Boolean(githubOwner),
      githubModels: llmClient.isConfigured(),
    },
  });
});

app.post("/webhooks/clickup", async (request: Request, response: Response) => {
  const payload = request.body as ClickUpWebhookPayload;
  const taskName = payload.task?.name ?? "Untitled ClickUp task";
  const taskDescription = payload.task?.description ?? "No description supplied.";
  const githubContext = parseClickUpGitHubContext(taskDescription, githubOwner);

  if (!githubOwner) {
    response.status(500).json({
      error: "GITHUB_OWNER is required for ClickUp-to-GitHub mapping.",
    });
    return;
  }

  if (!githubContext.repo) {
    response.status(400).json({
      error: "ClickUp description must include a repo entry such as `Repo: sdlc-ai`.",
    });
    return;
  }

  if (!githubClient.isConfigured()) {
    response.status(500).json({
      error: "GITHUB_TOKEN is required for ClickUp-to-GitHub workflow creation.",
    });
    return;
  }

  const repository: RepositoryContext = {
    owner: githubContext.owner,
    repo: githubContext.repo,
  };
  const branchName = githubContext.branch ?? buildResearchBranchName(taskName, payload.task?.id);
  const branchDetails = await githubClient.ensureBranch(repository, branchName);
  const repositoryContext = await githubClient.getRepositoryResearchContext(repository);
  const result = await routeCommand(
    "/research",
    {
      source: "clickup",
      taskBody: [
        `Task: ${taskName}`,
        "",
        `GitHub Owner: ${githubContext.owner}`,
        `GitHub Repo: ${githubContext.repo}`,
        `GitHub Branch: ${branchDetails.branch}`,
        `GitHub Base Branch: ${branchDetails.baseBranch}`,
        "",
        taskDescription,
      ]
        .filter((value): value is string => Boolean(value))
        .join("\n"),
      artifacts: {},
      repositoryContext,
    },
    llmClient,
  );

  let pullRequest: PullRequestContext & { htmlUrl: string; branch: string; baseBranch: string } | undefined;
  if (result.kind === "artifact") {
    await githubClient.upsertArtifactFileOnBranch(
      repository,
      branchDetails.branch,
      result.fileName,
      result.content,
    );
    const createdPullRequest = await githubClient.createPullRequestForBranch(
      repository,
      branchDetails.branch,
      `research: ${taskName}`,
      buildPullRequestBody(taskName, taskDescription),
      branchDetails.baseBranch,
    );

    pullRequest = {
      owner: repository.owner,
      repo: repository.repo,
      pullNumber: createdPullRequest.number,
      htmlUrl: createdPullRequest.html_url,
      branch: createdPullRequest.head.ref,
      baseBranch: createdPullRequest.base.ref,
    };

    await githubClient.postComment(
      pullRequest,
      `Generated \`${result.fileName}\` from the ClickUp webhook.\n\n${result.summary}\n\nWhen the research looks good, comment \`/plan\` on this PR.`,
    );
  }

  response.status(202).json({
    message: "Research scaffold generated from ClickUp webhook and synced to a pull request.",
    githubTarget: githubContext,
    pullRequest,
    result,
  });
});

app.post("/webhooks/github", async (request: Request, response: Response) => {
  const payload = request.body as GitHubIssueCommentWebhookPayload;
  const source: CommandSource = "github";
  const commentBody = payload.comment?.body ?? "";
  const command = extractCommand(commentBody);

  if (payload.action !== "created" || !payload.issue?.pull_request) {
    response.status(429).json({ ignored: "Only PR issue_comment created events are handled." });
    return;
  }

  if (!command) {
    response.status(400).json({ ignored: "No supported workflow command detected." });
    return;
  }

  if (!githubClient.isConfigured()) {
    response.status(500).json({ error: "GITHUB_TOKEN is required for GitHub webhook processing." });
    return;
  }

  const pullNumber = payload.issue.number;
  const owner = payload.repository?.owner?.login;
  const repo = payload.repository?.name;

  if (!pullNumber || !owner || !repo) {
    response.status(400).json({ error: "Missing repository or pull request context." });
    return;
  }

  const prContext: PullRequestContext = {
    owner,
    repo,
    pullNumber,
  };

  const artifacts: WorkflowArtifacts = await githubClient.loadArtifacts(prContext, [
    "research.md",
    "spec.md",
    "plan.md",
  ]);
  const result = await routeCommand(
    command,
    {
      source,
      taskBody: commentBody,
      artifacts,
    },
    llmClient,
  );

  if (result.kind === "artifact") {
    await githubClient.upsertArtifactFile(prContext, result.fileName, result.content);
    await githubClient.postComment(
      prContext,
      `Generated \`${result.fileName}\` for command \`${command}\`.\n\n${result.summary}`,
    );
  } else {
    await githubClient.postComment(prContext, result.content);
  }

  response.status(202).json({
    message: "Workflow command routed successfully.",
    command,
    summary: result.summary,
  });
});

app.listen(port, () => {
  console.log(`SDLC AI scaffold listening on port ${port}`);
});
