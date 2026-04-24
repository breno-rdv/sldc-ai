export interface ClickUpGitHubContext {
  owner: string;
  repo: string;
  branch?: string;
  pullNumber?: number;
}

function parseField(description: string, label: string): string | undefined {
  const match = description.match(new RegExp(`^${label}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim();
}

function parsePullNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().replace(/^#/, "");
  if (!/^\d+$/.test(normalized)) {
    return undefined;
  }

  return Number(normalized);
}

export function parseClickUpGitHubContext(
  description: string,
  owner: string | undefined,
): ClickUpGitHubContext {
  return {
    owner: owner ?? "",
    repo: parseField(description, "Repo") ?? "",
    branch: parseField(description, "Branch"),
    pullNumber: parsePullNumber(parseField(description, "PR") ?? parseField(description, "Pull Request")),
  };
}
