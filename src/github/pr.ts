import type { ArtifactFileName, WorkflowArtifacts } from "../commands/router";

export interface RepositoryContext {
  owner: string;
  repo: string;
}

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
  number: number;
  html_url: string;
  head: {
    ref: string;
    sha: string;
    repo: GitHubRepositoryRef;
  };
  base: {
    ref: string;
    repo: GitHubRepositoryRef;
  };
}

interface RepositoryDetails {
  default_branch: string;
  description: string | null;
  name: string;
  owner: GitHubUser;
}

interface ContentFileResponse {
  sha: string;
  content: string;
  encoding: string;
}

interface DirectoryEntryResponse {
  name: string;
  path: string;
  type: "file" | "dir";
}

interface GitReferenceResponse {
  object: {
    sha: string;
  };
}

interface PullRequestSummary {
  number: number;
  html_url: string;
  head: {
    ref: string;
  };
  base: {
    ref: string;
  };
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

  async ensureBranch(
    repository: RepositoryContext,
    branchName: string,
  ): Promise<{ branch: string; baseBranch: string }> {
    const repoDetails = await this.getRepository(repository);

    try {
      await this.getReference(repository, branchName);
      return {
        branch: branchName,
        baseBranch: repoDetails.default_branch,
      };
    } catch (error) {
      if (!(error instanceof GitHubApiError) || error.status !== 404) {
        throw error;
      }
    }

    const defaultBranchReference = await this.getReference(repository, repoDetails.default_branch);
    await this.request(`/repos/${repository.owner}/${repository.repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: defaultBranchReference.object.sha,
      }),
    });

    return {
      branch: branchName,
      baseBranch: repoDetails.default_branch,
    };
  }

  async upsertArtifactFile(
    context: PullRequestContext,
    fileName: string,
    content: string,
  ): Promise<void> {
    const pullRequest = await this.getPullRequest(context);
    await this.upsertArtifactFileOnBranch(
      {
        owner: pullRequest.head.repo.owner.login,
        repo: pullRequest.head.repo.name,
      },
      pullRequest.head.ref,
      fileName,
      content,
    );
  }

  async upsertArtifactFileOnBranch(
    repository: RepositoryContext,
    branch: string,
    fileName: string,
    content: string,
  ): Promise<void> {
    const existingFile = await this.getContentMetadata(
      repository,
      fileName,
      branch,
    );

    await this.request(
      `/repos/${repository.owner}/${repository.repo}/contents/${encodeURIComponent(fileName)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          message: `chore(ai): update ${fileName}`,
          content: encodeBase64(content),
          branch,
          sha: existingFile?.sha,
        }),
      },
    );
  }

  async createPullRequestForBranch(
    repository: RepositoryContext,
    branch: string,
    title: string,
    body: string,
    baseBranch: string,
  ): Promise<PullRequestSummary> {
    const existingPullRequest = await this.findOpenPullRequestForBranch(repository, branch);
    if (existingPullRequest) {
      return existingPullRequest;
    }

    return this.request<PullRequestSummary>(`/repos/${repository.owner}/${repository.repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title,
        head: branch,
        base: baseBranch,
        body,
      }),
    });
  }

  async getRepositoryResearchContext(repository: RepositoryContext): Promise<string> {
    const repoDetails = await this.getRepository(repository);
    const rootEntries = await this.listDirectory(repository, "", repoDetails.default_branch);
    const interestingFileNames = [
      "README.md",
      "README",
      "readme.md",
      "package.json",
      "tsconfig.json",
      "pyproject.toml",
      "requirements.txt",
      "Cargo.toml",
    ];

    const interestingFiles = rootEntries
      .filter((entry) => entry.type === "file" && interestingFileNames.includes(entry.name))
      .slice(0, 4);
    const fileSnapshots = await Promise.all(
      interestingFiles.map(async (entry) => {
        const content = await this.getFileContent(repository, entry.path, repoDetails.default_branch);
        if (!content) {
          return undefined;
        }

        return `### ${entry.path}\n${this.truncate(content, 1400)}`;
      }),
    );

    const rootListing = rootEntries
      .map((entry) => `- ${entry.type}: ${entry.path}`)
      .join("\n");

    return [
      `Repository: ${repository.owner}/${repository.repo}`,
      `Default branch: ${repoDetails.default_branch}`,
      repoDetails.description ? `Description: ${repoDetails.description}` : undefined,
      "",
      "Root entries:",
      rootListing || "- (no entries returned)",
      "",
      fileSnapshots.filter((entry): entry is string => Boolean(entry)).join("\n\n"),
    ]
      .filter((entry): entry is string => Boolean(entry))
      .join("\n");
  }

  async postComment(context: PullRequestContext, body: string): Promise<void> {
    await this.request(`/repos/${context.owner}/${context.repo}/issues/${context.pullNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }

  private async getPullRequest(context: PullRequestContext): Promise<PullRequestDetails> {
    return this.request<PullRequestDetails>(
      `/repos/${context.owner}/${context.repo}/pulls/${context.pullNumber}`,
    );
  }

  private async getRepository(repository: RepositoryContext): Promise<RepositoryDetails> {
    return this.request<RepositoryDetails>(`/repos/${repository.owner}/${repository.repo}`);
  }

  private async getReference(
    repository: RepositoryContext,
    branch: string,
  ): Promise<GitReferenceResponse> {
    return this.request<GitReferenceResponse>(
      `/repos/${repository.owner}/${repository.repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    );
  }

  private async findOpenPullRequestForBranch(
    repository: RepositoryContext,
    branch: string,
  ): Promise<PullRequestSummary | undefined> {
    const query = new URLSearchParams({
      state: "open",
      head: `${repository.owner}:${branch}`,
    });

    const pullRequests = await this.request<PullRequestSummary[]>(
      `/repos/${repository.owner}/${repository.repo}/pulls?${query.toString()}`,
    );

    return pullRequests[0];
  }

  private async listDirectory(
    repository: RepositoryContext,
    path: string,
    ref: string,
  ): Promise<DirectoryEntryResponse[]> {
    const pathSegment = path.length > 0 ? `/${encodeURIComponent(path)}` : "";
    const response = await this.request<DirectoryEntryResponse[]>(
      `/repos/${repository.owner}/${repository.repo}/contents${pathSegment}?ref=${encodeURIComponent(ref)}`,
    );

    return Array.isArray(response) ? response : [];
  }

  private async getFileContent(
    repository: RepositoryContext,
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
    repository: RepositoryContext,
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

  private truncate(value: string, maxLength: number): string {
    return value.length > maxLength ? `${value.slice(0, maxLength)}\n...` : value;
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
