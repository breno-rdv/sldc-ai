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
    this.model = options.model ?? process.env.GITHUB_MODEL ?? "openai/gpt-4.1-mini";
  }

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  async renderArtifact(input: RenderArtifactInput): Promise<string> {
    if (!this.isConfigured()) {
      return this.renderArtifactFallback(input);
    }

    return this.generateText([
      "You are generating a structured markdown artifact for a spec-driven development pipeline.",
      "Return markdown only.",
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
  }

  async renderComment(input: RenderCommentInput): Promise<string> {
    if (!this.isConfigured()) {
      return this.renderCommentFallback(input);
    }

    return this.generateText([
      "You are generating a concise markdown comment for a GitHub pull request workflow.",
      "Return markdown only.",
      "",
      `Role: ${input.role}`,
      `Objective: ${input.objective}`,
      "Inputs:",
      ...input.inputs.map((entry) => `- ${entry}`),
    ]);
  }

  private async generateText(promptLines: Array<string | undefined>): Promise<string> {
    if (!this.token) {
      throw new Error("GITHUB_TOKEN is not configured.");
    }

    const response = await fetch(new URL("/chat/completions", this.apiBaseUrl), {
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

    const payload = (await response.json()) as ChatCompletionResponse;
    if (!response.ok) {
      throw new Error(`GitHub Models request failed with status ${response.status}.`);
    }

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("GitHub Models response did not include content.");
    }

    return content;
  }

  private renderArtifactFallback(input: RenderArtifactInput): string {
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
      "GITHUB_TOKEN is not set. The scaffold uses deterministic placeholders until GitHub Models access is configured.",
      "",
      sections,
      "",
    ].join("\n");
  }

  private renderCommentFallback(input: RenderCommentInput): string {
    return [
      `### ${input.role}`,
      "",
      input.objective,
      "",
      "LLM client status: not configured.",
      "",
      "Inputs:",
      ...input.inputs.map((entry) => `- ${entry}`),
    ].join("\n");
  }
}
