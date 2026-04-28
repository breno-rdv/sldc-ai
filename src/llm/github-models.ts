interface ArtifactSection {
  heading: string;
  body?: string;
  bullets?: string[];
}

interface RenderArtifactInput {
  title: string;
  summary: string;
  sections: ArtifactSection[];
}

interface RenderCommentInput {
  role: string;
  objective: string;
  inputs: string[];
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface GitHubModelsWorkflowClientOptions {
  token?: string;
  apiBaseUrl?: string;
  model?: string;
}

export class GitHubModelsWorkflowClient {
  private readonly token?: string;
  private readonly apiBaseUrl: string;
  private readonly model: string;

  constructor(options: GitHubModelsWorkflowClientOptions = {}) {
    this.token = options.token ?? process.env.GITHUB_TOKEN;
    this.apiBaseUrl = options.apiBaseUrl ?? process.env.GITHUB_MODELS_API_URL ?? "https://models.github.ai/inference";
    this.model = options.model ?? process.env.GITHUB_MODEL ?? "openai/gpt-4o-mini";
  }

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  async listModels(): Promise<string[]> {
    if (!this.token) {
      throw new Error("GITHUB_TOKEN is not configured.");
    }

    const url = `${this.apiBaseUrl.replace(/\/$/, "")}/v1/models`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.token}`,
        "User-Agent": "sdlc-ai-scaffold",
      },
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`Failed to list models (${response.status}): ${responseText.slice(0, 300)}`);
    }

    const payload = JSON.parse(responseText) as { data?: Array<{ id: string }> } | Array<{ id: string }>;
    const items = Array.isArray(payload) ? payload : (payload.data ?? []);
    return items.map((m) => m.id).sort();
  }

  async renderArtifact(input: RenderArtifactInput): Promise<string> {
    if (!this.isConfigured()) {
      return this.renderArtifactFallback(input);
    }

    try {
      return await this.generateText([
        "You are generating a structured markdown artifact for a spec-driven development pipeline.",
        "Return markdown only.",
        "Ground every section in the provided inputs.",
        "Do not invent repository files, modules, or capabilities that are not supported by the inputs.",
        "When exact file paths are unknown, refer to directories, components, or investigation steps instead.",
        "",
        `Title: ${input.title}`,
        `Summary: ${input.summary}`,
        "",
        ...input.sections.flatMap((section) => [
          `Section: ${section.heading}`,
          section.body ? `Body: ${section.body}` : undefined,
          section.bullets?.length ? `Bullets: ${section.bullets.join(" | ")}` : undefined,
          "",
        ]),
      ]);
    } catch (error) {
      return this.renderArtifactFallback(input, error);
    }
  }

  async renderComment(input: RenderCommentInput): Promise<string> {
    if (!this.isConfigured()) {
      return this.renderCommentFallback(input);
    }

    try {
      return await this.generateText([
        "You are generating a concise markdown comment for a GitHub pull request workflow.",
        "Return markdown only.",
        "",
        `Role: ${input.role}`,
        `Objective: ${input.objective}`,
        "Inputs:",
        ...input.inputs.map((entry) => `- ${entry}`),
      ]);
    } catch (error) {
      return this.renderCommentFallback(input, error);
    }
  }

  private async generateText(promptLines: Array<string | undefined>): Promise<string> {
    if (!this.token) {
      throw new Error("GITHUB_TOKEN is not configured.");
    }

    const response = await fetch(this.buildChatCompletionsUrl(), {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "User-Agent": "sdlc-ai-scaffold",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content: promptLines.filter((line): line is string => Boolean(line)).join("\n"),
          },
        ],
      }),
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        `GitHub Models request failed with status ${response.status}: ${responseText.slice(0, 300)}`,
      );
    }

    let payload: ChatCompletionResponse;
    try {
      payload = JSON.parse(responseText) as ChatCompletionResponse;
    } catch {
      throw new Error(
        `GitHub Models returned a non-JSON response: ${responseText.slice(0, 300)}`,
      );
    }

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("GitHub Models response did not include content.");
    }

    return content;
  }

  private buildChatCompletionsUrl(): string {
    return `${this.apiBaseUrl.replace(/\/$/, "")}/chat/completions`;
  }

  private renderArtifactFallback(input: RenderArtifactInput, error?: unknown): string {
    const sections = input.sections
      .map((section) => {
        const header = `## ${section.heading}`;
        const body = section.body ? `${section.body}\n` : "";
        const bullets = section.bullets?.length
          ? `${section.bullets.map((entry) => `- ${entry}`).join("\n")}\n`
          : "";

        return `${header}\n\n${body}${bullets}`.trimEnd();
      })
      .join("\n\n");

    return [
      `# ${input.title}`,
      "",
      input.summary,
      "",
      this.buildFallbackNotice(error),
      "",
      sections,
      "",
    ].join("\n");
  }

  private renderCommentFallback(input: RenderCommentInput, error?: unknown): string {
    return [
      `### ${input.role}`,
      "",
      input.objective,
      "",
      this.buildFallbackNotice(error),
      "",
      "Inputs:",
      ...input.inputs.map((entry) => `- ${entry}`),
    ].join("\n");
  }

  private buildFallbackNotice(error?: unknown): string {
    if (error instanceof Error) {
      return `GitHub Models request failed, so the scaffold used a deterministic fallback.\n\nError: ${error.message}`;
    }

    return "GITHUB_TOKEN is not set. The scaffold uses deterministic placeholders until GitHub Models access is configured.";
  }
}
