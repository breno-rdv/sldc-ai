import type { ArtifactFileName, WorkflowArtifacts } from "../commands/router";

export interface PullRequestContext {
  owner: string;
  repo: string;
  pullNumber: number;
}

interface GitHubUser {
  login: string;
}

interface GitHubRepositoryRef {
  name: string;
  owner: GitHubUser;
}

interface PullRequestDetails {
  head: {
    ref: string;
    sha: string;
    repo: GitHubRepositoryRef;
  };
}

interface ContentFileResponse {
  sha: string;
  content: string;
  encoding: string;
}

interface GitHubClientOptions {
  token?: string;
  apiBaseUrl?: string;
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody: string,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

function formatPullRequestRef(context: PullRequestContext): string {
  return `${context.owner}/${context.repo}#${context.pullNumber}`;
}

function encodeBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function decodeBase64(value: string): string {
  return Buffer.from(value.replace(/\n/g, ""), "base64").toString("utf8");
}

export class GitHubPullRequestClient {
  private readonly token?: string;
  private readonly apiBaseUrl: string;

  constructor(options: GitHubClientOptions = {}) {
    this.token = options.token ?? process.env.GITHUB_TOKEN;
    this.apiBaseUrl = options.apiBaseUrl ?? process.env.GITHUB_API_URL ?? "https://api.github.com";
  }

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  async loadArtifacts(
    context: PullRequestContext,
    fileNames: ArtifactFileName[],
  ): Promise<WorkflowArtifacts> {
    const pullRequest = await this.getPullRequest(context);
    const ref = pullRequest.head.ref;
    const repo = pullRequest.head.repo;

    const artifactEntries = await Promise.all(
      fileNames.map(async (fileName) => [
        fileName,
        await this.getFileContent(
          {
            owner: repo.owner.login,
            repo: repo.name,
          },
          fileName,
          ref,
        ),
      ]),
    );

    return Object.fromEntries(
      artifactEntries.filter((entry): entry is [ArtifactFileName, string] => typeof entry[1] === "string"),
    );
  }

  async upsertArtifactFile(
    context: PullRequestContext,
    fileName: string,
    content: string,
  ): Promise<void> {
    const pullRequest = await this.getPullRequest(context);
    const headRepository = pullRequest.head.repo;
    const ref = pullRequest.head.ref;
    const existingFile = await this.getContentMetadata(
      {
        owner: headRepository.owner.login,
        repo: headRepository.name,
      },
      fileName,
      ref,
    );

    await this.request(
      `/repos/${headRepository.owner.login}/${headRepository.name}/contents/${encodeURIComponent(fileName)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          message: `chore(ai): update ${fileName}`,
          content: encodeBase64(content),
          branch: ref,
          sha: existingFile?.sha,
        }),
      },
    );
  }

  async postComment(context: PullRequestContext, body: string): Promise<void> {
    await this.request(`/repos/${context.owner}/${context.repo}/issues/${context.pullNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }

  async applyCodeChanges(context: PullRequestContext, summary: string): Promise<void> {
    console.info(`[scaffold] Would apply code changes on ${formatPullRequestRef(context)}`);
    void summary;
  }

  private async getPullRequest(context: PullRequestContext): Promise<PullRequestDetails> {
    return this.request<PullRequestDetails>(
      `/repos/${context.owner}/${context.repo}/pulls/${context.pullNumber}`,
    );
  }

  private async getFileContent(
    repository: { owner: string; repo: string },
    path: string,
    ref: string,
  ): Promise<string | undefined> {
    const metadata = await this.getContentMetadata(repository, path, ref);
    if (!metadata) {
      return undefined;
    }

    if (metadata.encoding !== "base64") {
      throw new Error(`Unsupported encoding "${metadata.encoding}" for ${path}.`);
    }

    return decodeBase64(metadata.content);
  }

  private async getContentMetadata(
    repository: { owner: string; repo: string },
    path: string,
    ref: string,
  ): Promise<ContentFileResponse | undefined> {
    try {
      return await this.request<ContentFileResponse>(
        `/repos/${repository.owner}/${repository.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`,
      );
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) {
        return undefined;
      }

      throw error;
    }
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.token) {
      throw new Error("GITHUB_TOKEN is not configured.");
    }

    const response = await fetch(new URL(path, this.apiBaseUrl), {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "User-Agent": "sdlc-ai-scaffold",
        "X-GitHub-Api-Version": "2022-11-28",
        ...init?.headers,
      },
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new GitHubApiError(
        `GitHub API request failed for ${path}`,
        response.status,
        responseText,
      );
    }

    if (responseText.length === 0) {
      return undefined as T;
    }

    return JSON.parse(responseText) as T;
  }
}
