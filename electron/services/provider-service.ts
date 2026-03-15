import type {
  AgentProviderKind,
  AssistantSuggestion,
  DotNetSolutionProfile,
  ProposedChange,
  ProviderStatus,
  ReviewCheck,
  TaskPlan,
  TranscriptEntry,
  WorkspaceSummary
} from "../ipc/contracts.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CommandRunner } from "./command-runner.js";

interface AgentProvider {
  kind: AgentProviderKind;
  command: string;
  buildSuggestions(
    workspace: WorkspaceSummary,
    profile: DotNetSolutionProfile,
    prompt: string
  ): AssistantSuggestion[];
  planTask(
    workspace: WorkspaceSummary,
    profile: DotNetSolutionProfile,
    prompt: string
  ): TaskPlan;
  createCommand(
    workspace: WorkspaceSummary,
    profile: DotNetSolutionProfile,
    prompt: string
  ): { command: string; args: string[] };
  createProposalCommand(
    workspace: WorkspaceSummary,
    profile: DotNetSolutionProfile,
    prompt: string
  ): { command: string; args: string[] };
  createPlanCommand(
    workspace: WorkspaceSummary,
    profile: DotNetSolutionProfile,
    prompt: string
  ): { command: string; args: string[] };
  parseStdout(chunk: string): TranscriptEntry[];
  parseStderr(chunk: string): TranscriptEntry[];
  createCompletionEntry(success: boolean, output: string): TranscriptEntry | undefined;
}

interface ProviderProposalResponse {
  proposals: Array<{
    title: string;
    summary: string;
    category?: ProposedChange["category"];
    filePath: string;
    projectId?: string;
    taskIndex?: number;
    rationale?: string[];
    proposedContents: string;
    reviewChecks?: ReviewCheck[];
  }>;
}

interface ProviderPlanResponse {
  goal: string;
  steps: string[];
  commands?: string[];
  files?: string[];
}

export interface ProposalGenerationResult {
  source: AgentProviderKind;
  proposals?: ProposedChange[];
  failureReason?: string;
}

export interface PlanGenerationResult {
  source: AgentProviderKind;
  taskPlan?: TaskPlan;
  failureReason?: string;
}

export interface ProviderActivityUpdate {
  summary?: string;
  entry?: TranscriptEntry;
}

class CodexProvider implements AgentProvider {
  readonly kind = "codex";
  readonly command = "codex";

  buildSuggestions(
    workspace: WorkspaceSummary,
    profile: DotNetSolutionProfile,
    prompt: string
  ): AssistantSuggestion[] {
    const primaryFramework = profile.targetFrameworks[0] ?? "net10.0";
    const plan = buildFeaturePlan(workspace, profile, prompt);
    return [
      {
        id: `codex-${Date.now()}`,
        title: "Codex implementation review",
        summary: `Use ${primaryFramework} as the production baseline for ${workspace.name}. Current focus: ${plan.summary}`,
        severity: profile.usesPreviewSdk ? "warning" : "info",
        source: "provider"
      }
    ];
  }

  planTask(
    workspace: WorkspaceSummary,
    profile: DotNetSolutionProfile,
    prompt: string
  ): TaskPlan {
    return buildFeaturePlan(workspace, profile, prompt);
  }

  createCommand(
    workspace: WorkspaceSummary,
    _profile: DotNetSolutionProfile,
    prompt: string
  ): { command: string; args: string[] } {
    return {
      command: this.command,
      args: [
        "exec",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "--json",
        "-C",
        workspace.rootPath,
        prompt
      ]
    };
  }

  createProposalCommand(
    workspace: WorkspaceSummary,
    profile: DotNetSolutionProfile,
    prompt: string
  ): { command: string; args: string[] } {
    const instruction = buildProposalPrompt(workspace, profile, prompt);
    return this.createCommand(workspace, profile, instruction);
  }

  createPlanCommand(
    workspace: WorkspaceSummary,
    profile: DotNetSolutionProfile,
    prompt: string
  ): { command: string; args: string[] } {
    const instruction = buildPlanPrompt(workspace, profile, prompt);
    return this.createCommand(workspace, profile, instruction);
  }

  parseStdout(chunk: string): TranscriptEntry[] {
    return parseJsonLines(chunk, "codex");
  }

  parseStderr(chunk: string): TranscriptEntry[] {
    return toEntries(chunk, "error");
  }

  createCompletionEntry(success: boolean, output: string): TranscriptEntry | undefined {
    return {
      id: `completion-${Date.now()}`,
      kind: success ? "system" : "error",
      text: success ? "Codex session completed." : output || "Codex session failed.",
      timestamp: Date.now()
    };
  }
}

class ClaudeCodeProvider implements AgentProvider {
  readonly kind = "claude-code";
  readonly command = "claude";

  buildSuggestions(
    workspace: WorkspaceSummary,
    profile: DotNetSolutionProfile,
    prompt: string
  ): AssistantSuggestion[] {
    const plan = buildFeaturePlan(workspace, profile, prompt);
    return [
      {
        id: `claude-${Date.now()}`,
        title: "Claude Code architecture review",
        summary: `Analyze ${workspace.name} with emphasis on project boundaries and implementation fit. Current focus: ${plan.summary}`,
        severity: profile.projectCount > 3 ? "warning" : "info",
        source: "provider"
      }
    ];
  }

  planTask(
    workspace: WorkspaceSummary,
    profile: DotNetSolutionProfile,
    prompt: string
  ): TaskPlan {
    return buildFeaturePlan(workspace, profile, prompt);
  }

  createCommand(
    workspace: WorkspaceSummary,
    _profile: DotNetSolutionProfile,
    prompt: string
  ): { command: string; args: string[] } {
    return {
      command: this.command,
      args: [
        "-p",
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "--permission-mode",
        "plan",
        "--add-dir",
        workspace.rootPath,
        "--",
        prompt
      ]
    };
  }

  createProposalCommand(
    workspace: WorkspaceSummary,
    profile: DotNetSolutionProfile,
    prompt: string
  ): { command: string; args: string[] } {
    const instruction = buildProposalPrompt(workspace, profile, prompt);
    return this.createCommand(workspace, profile, instruction);
  }

  createPlanCommand(
    workspace: WorkspaceSummary,
    profile: DotNetSolutionProfile,
    prompt: string
  ): { command: string; args: string[] } {
    const instruction = buildPlanPrompt(workspace, profile, prompt);
    return this.createCommand(workspace, profile, instruction);
  }

  parseStdout(chunk: string): TranscriptEntry[] {
    return parseJsonLines(chunk, "claude-code");
  }

  parseStderr(chunk: string): TranscriptEntry[] {
    return toEntries(chunk, "error");
  }

  createCompletionEntry(success: boolean, output: string): TranscriptEntry | undefined {
    return {
      id: `completion-${Date.now()}`,
      kind: success ? "system" : "error",
      text: success ? "Claude Code session completed." : output || "Claude Code session failed.",
      timestamp: Date.now()
    };
  }
}

export class ProviderService {
  private readonly providers = new Map<AgentProviderKind, AgentProvider>([
    ["codex", new CodexProvider()],
    ["claude-code", new ClaudeCodeProvider()]
  ]);

  constructor(private readonly commandRunner = new CommandRunner()) {}

  getProvider(kind: AgentProviderKind): AgentProvider {
    return this.providers.get(kind) ?? this.providers.get("codex")!;
  }

  async getProviderStatuses(): Promise<ProviderStatus[]> {
    const statuses: ProviderStatus[] = [];

    for (const provider of this.providers.values()) {
      const status = await this.getProviderStatus(provider);
      statuses.push(status);
    }

    return statuses;
  }

  private async getProviderStatus(provider: AgentProvider): Promise<ProviderStatus> {
    const versionResult = await this.commandRunner.run(provider.command, ["--version"]);
    return {
      kind: provider.kind,
      installed: versionResult.ok,
      command: provider.command,
      version: versionResult.ok
        ? versionResult.stdout.trim() || versionResult.stderr.trim()
        : undefined,
      error: versionResult.ok ? undefined : versionResult.stderr.trim()
    };
  }

  runPromptSession(
    workspace: WorkspaceSummary,
    profile: DotNetSolutionProfile,
    prompt: string,
    callbacks: {
      onEntry: (entry: TranscriptEntry) => void;
      onComplete: (result: { success: boolean; summary: string }) => void;
    }
  ): void {
    const provider = this.getProvider(workspace.provider);
    const { command, args } = provider.createCommand(workspace, profile, prompt);

    this.commandRunner.spawnStreaming(command, args, {
      cwd: workspace.rootPath,
      callbacks: {
        onStdout: (chunk) => {
          for (const entry of provider.parseStdout(chunk)) {
            callbacks.onEntry(entry);
          }
        },
        onStderr: (chunk) => {
          for (const entry of provider.parseStderr(chunk)) {
            callbacks.onEntry(entry);
          }
        },
        onExit: (result) => {
          const completion = provider.createCompletionEntry(
            result.ok,
            result.stderr || result.stdout
          );
          if (completion) {
            callbacks.onEntry(completion);
          }

          callbacks.onComplete({
            success: result.ok,
            summary: result.ok
              ? `${provider.kind} finished successfully.`
              : `${provider.kind} exited with code ${result.exitCode}.`
          });
        }
      }
    });
  }

  async generateStructuredProposals(
    workspace: WorkspaceSummary,
    profile: DotNetSolutionProfile,
    prompt: string
  ): Promise<ProposalGenerationResult> {
    const provider = this.getProvider(workspace.provider);
    const { command, args } = provider.createProposalCommand(workspace, profile, prompt);
    const result = await this.commandRunner.run(command, args, {
      cwd: workspace.rootPath,
      timeoutMs: 25_000
    });

    if (!result.ok) {
      return {
        source: provider.kind,
        failureReason: result.stderr.trim() || result.stdout.trim() || `${provider.kind} exited unsuccessfully.`
      };
    }

    const parsed = parseProposalResponse(result.stdout);
    if (!parsed || parsed.proposals.length === 0) {
      return {
        source: provider.kind,
        failureReason: "Provider returned no structured proposals."
      };
    }

    const proposals = await Promise.all(
      parsed.proposals.map(async (proposal, index) => {
        const normalizedPath = proposal.filePath.replace(/\\/g, "/");
        const absolutePath = path.join(workspace.rootPath, normalizedPath);
        let originalContents = "";
        try {
          originalContents = await readFile(absolutePath, "utf8");
        } catch {
          originalContents = "";
        }

        return {
          id: `provider-proposal-${index}-${normalizedPath}`,
          title: proposal.title,
          summary: proposal.summary,
          category: proposal.category ?? "task",
          source: provider.kind,
          filePath: normalizedPath,
          projectId: proposal.projectId,
          taskIndex: proposal.taskIndex,
          originalContents,
          proposedContents: proposal.proposedContents,
          rationale: proposal.rationale ?? [],
          reviewChecks: proposal.reviewChecks ?? []
        } satisfies ProposedChange;
      })
    );

    const filtered = proposals.filter((proposal) => proposal.proposedContents.trim().length > 0);
    if (filtered.length === 0) {
      return {
        source: provider.kind,
        failureReason: "Provider proposals did not contain usable file contents."
      };
    }

    return {
      source: provider.kind,
      proposals: filtered
    };
  }

  async generateStructuredTaskPlan(
    workspace: WorkspaceSummary,
    profile: DotNetSolutionProfile,
    prompt: string
  ): Promise<PlanGenerationResult> {
    const provider = this.getProvider(workspace.provider);
    const { command, args } = provider.createPlanCommand(workspace, profile, prompt);
    const result = await this.commandRunner.run(command, args, {
      cwd: workspace.rootPath,
      timeoutMs: 25_000
    });

    if (!result.ok) {
      return {
        source: provider.kind,
        failureReason: result.stderr.trim() || result.stdout.trim() || `${provider.kind} exited unsuccessfully.`
      };
    }

    const parsed = parsePlanResponse(result.stdout);
    if (!parsed || parsed.steps.length === 0) {
      return {
        source: provider.kind,
        failureReason: "Provider returned no structured implementation plan."
      };
    }

    return {
      source: provider.kind,
      taskPlan: {
        id: `task-${Date.now()}`,
        goal: parsed.goal || prompt,
        steps: parsed.steps,
        commands: parsed.commands ?? [],
        files: parsed.files ?? []
      }
    };
  }

  interpretTranscriptEntry(
    entry: TranscriptEntry,
    provider: AgentProviderKind
  ): ProviderActivityUpdate {
    const readableText = sanitizeTranscriptText(entry.text);
    const summary = summarizeProviderActivity(entry, provider);

    if (!readableText) {
      return { summary };
    }

    return {
      summary,
      entry: {
        ...entry,
        text: readableText
      }
    };
  }
}

const buildProposalPrompt = (
  workspace: WorkspaceSummary,
  profile: DotNetSolutionProfile,
  prompt: string
): string => {
  const projectList = profile.projects
    .map((project) => `${project.name} -> ${project.relativePath}`)
    .join("\n");
  const taskContext = [
    "You are preparing a code-review proposal for a .NET solution.",
    "Return JSON only. Do not include markdown fences or explanatory prose.",
    "Schema:",
    '{ "proposals": [ { "title": string, "summary": string, "category": "task" | "bug" | "risk", "filePath": string, "projectId": string | undefined, "taskIndex": number | undefined, "rationale": string[], "reviewChecks": [ { "lens": "security" | "dry" | "validation", "status": "pass" | "watch" | "action", "title": string, "detail": string } ], "proposedContents": string } ] }',
    "Only include files you can justify changing from the prompt.",
    `Workspace: ${workspace.name}`,
    `Primary frameworks: ${profile.targetFrameworks.join(", ")}`,
    `Projects:\n${projectList}`,
    `Request: ${prompt}`
  ];

  return taskContext.join("\n\n");
};

const buildPlanPrompt = (
  workspace: WorkspaceSummary,
  profile: DotNetSolutionProfile,
  prompt: string
): string => {
  const projectList = profile.projects
    .map((project) => `${project.name} -> ${project.relativePath}`)
    .join("\n");

  return [
    "You are preparing an implementation plan for a .NET solution.",
    "Return JSON only. Do not include markdown fences or explanatory prose.",
    "Schema:",
    '{ "goal": string, "steps": string[], "commands": string[], "files": string[] }',
    "Keep the steps concrete and implementation-oriented.",
    "Only include commands and files that are relevant to the requested feature or review.",
    `Workspace: ${workspace.name}`,
    `Primary frameworks: ${profile.targetFrameworks.join(", ")}`,
    `Projects:\n${projectList}`,
    `Request: ${prompt}`
  ].join("\n\n");
};

const buildFeaturePlan = (
  workspace: WorkspaceSummary,
  profile: DotNetSolutionProfile,
  prompt: string
): TaskPlan & { summary: string } => {
  const lower = prompt.toLowerCase();
  const webProject = profile.projects.find(
    (project) => project.projectType === "blazor" || project.projectType === "web"
  );
  const testProject = profile.projects.find((project) => project.projectType === "test");
  const startupFile = webProject?.startupFiles[0] ?? webProject?.visibleFiles[0];
  const configFile = webProject?.visibleFiles.find((file) => file.toLowerCase().includes("appsettings"));
  const testFile = testProject?.visibleFiles[0];

  if (lower.includes("login") || lower.includes("auth")) {
    return {
      id: `task-${Date.now()}`,
      goal: prompt,
      summary: "Break the login feature into auth setup, UI flow, protection rules, and validation.",
      steps: [
        "Inspect the current web app structure and choose the correct login/auth pattern for this solution.",
        "Add or update startup/auth configuration and any required supporting services.",
        "Implement the login UI flow and connect it to the chosen auth path.",
        "Protect the relevant routes or components and confirm user state handling.",
        "Add validation steps or tests so the login flow can be checked safely."
      ],
      commands: [
        "dotnet --info",
        profile.solutionFiles[0] ? `dotnet build ${profile.solutionFiles[0]}` : "dotnet build",
        testProject ? `dotnet test ${testProject.relativePath}` : "dotnet test"
      ],
      files: [startupFile, configFile, testFile].filter((value): value is string => Boolean(value))
    };
  }

  return {
    id: `task-${Date.now()}`,
    goal: prompt,
    summary: "Break the requested feature into implementation, integration, and validation steps.",
    steps: [
      `Inspect the relevant solution structure for ${workspace.name}.`,
      "Identify the files and projects that should change for this feature.",
      "Prepare the implementation steps and proposed code changes for review.",
      "Define the validation path before the change is accepted."
    ],
    commands: [
      "dotnet --info",
      profile.solutionFiles[0] ? `dotnet build ${profile.solutionFiles[0]}` : "dotnet build"
    ],
    files: [startupFile, configFile, testFile].filter((value): value is string => Boolean(value))
  };
};

const toEntries = (
  chunk: string,
  kind: TranscriptEntry["kind"]
): TranscriptEntry[] =>
  chunk
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      id: `${kind}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      kind,
      text: line,
      timestamp: Date.now()
    }));

const parseJsonLines = (
  chunk: string,
  provider: AgentProviderKind
): TranscriptEntry[] => {
  const entries: TranscriptEntry[] = [];

  for (const line of chunk.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    try {
      const payload = JSON.parse(line) as Record<string, unknown>;
      const text = extractText(payload);
      if (text) {
        entries.push({
          id: `${provider}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          kind: inferKind(payload),
          text,
          timestamp: Date.now()
        });
      }
    } catch {
      entries.push({
        id: `${provider}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        kind: "assistant",
        text: line,
        timestamp: Date.now()
      });
    }
  }

  return entries;
};

const inferKind = (payload: Record<string, unknown>): TranscriptEntry["kind"] => {
  const type = String(payload.type ?? payload.role ?? "").toLowerCase();
  if (type.includes("error")) {
    return "error";
  }
  if (type.includes("tool")) {
    return "tool";
  }
  if (type.includes("system")) {
    return "system";
  }
  return "assistant";
};

const extractText = (payload: Record<string, unknown>): string | undefined => {
  const candidates = [
    payload.text,
    payload.message,
    payload.summary,
    payload.output,
    payload.delta,
    payload.content
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  if (Array.isArray(payload.content)) {
    const text = payload.content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
          return item.text;
        }
        return "";
      })
      .join(" ")
      .trim();

    if (text) {
      return text;
    }
  }

  if (payload.result && typeof payload.result === "object") {
    return extractText(payload.result as Record<string, unknown>);
  }

  return undefined;
};

const sanitizeTranscriptText = (text: string): string | undefined => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }

  const absolutePathMatches = normalized.match(/(?:\/Users\/|[A-Za-z]:\\)[^\s]+/g) ?? [];
  const hasPathFlood =
    absolutePathMatches.length >= 3 ||
    normalized.includes(".runtimeconfig.json") ||
    normalized.includes("Microsoft.VisualStudio.TestPlatform") ||
    normalized.includes("xunit.assert.dll");

  if (hasPathFlood) {
    return undefined;
  }

  if (normalized.length > 320) {
    return `${normalized.slice(0, 317)}...`;
  }

  return normalized;
};

const summarizeProviderActivity = (
  entry: TranscriptEntry,
  provider: AgentProviderKind
): string | undefined => {
  const lower = entry.text.toLowerCase();
  const providerLabel = provider === "claude-code" ? "Claude Code" : "Codex";

  if (entry.kind === "error") {
    if (lower.includes("json")) {
      return `${providerLabel} hit a response-format issue.`;
    }
    if (lower.includes("network") || lower.includes("enotfound") || lower.includes("fetch")) {
      return `${providerLabel} hit a network problem while working.`;
    }
    return `${providerLabel} reported a problem while processing the request.`;
  }

  if (entry.kind === "tool") {
    if (lower.includes("rg ") || lower.includes("find ") || lower.includes("glob")) {
      return `${providerLabel} is locating the relevant files in the solution.`;
    }
    if (lower.includes("dotnet build") || lower.includes("dotnet test")) {
      return `${providerLabel} is checking the build and test path for this change.`;
    }
    return `${providerLabel} is using tools to inspect the solution.`;
  }

  if (lower.includes("plan") || lower.includes("step")) {
    return `${providerLabel} is drafting the implementation plan.`;
  }
  if (
    lower.includes("inspect") ||
    lower.includes("analy") ||
    lower.includes("scan") ||
    lower.includes("read")
  ) {
    return `${providerLabel} is inspecting the solution and current code.`;
  }
  if (lower.includes("search") || lower.includes("locat") || lower.includes("find")) {
    return `${providerLabel} is locating the files involved in this request.`;
  }
  if (
    lower.includes("diff") ||
    lower.includes("proposal") ||
    lower.includes("change") ||
    lower.includes("patch")
  ) {
    return `${providerLabel} is preparing the code changes for review.`;
  }
  if (entry.kind === "assistant") {
    return `${providerLabel} is reasoning through the implementation.`;
  }
  if (entry.kind === "system") {
    return `${providerLabel} is updating the review session.`;
  }

  return undefined;
};

const parseProposalResponse = (stdout: string): ProviderProposalResponse | undefined => {
  const direct = tryParseProposalPayload(stdout.trim());
  if (direct) {
    return direct;
  }

  const fenced = stdout.match(/```json\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    const parsed = tryParseProposalPayload(fenced.trim());
    if (parsed) {
      return parsed;
    }
  }

  const jsonLines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const extractedTexts: string[] = [];
  for (const line of jsonLines) {
    const parsedLine = tryParseJson(line);
    if (parsedLine && typeof parsedLine === "object") {
      const proposalPayload = tryParseProposalPayload(JSON.stringify(parsedLine));
      if (proposalPayload) {
        return proposalPayload;
      }

      const text = extractText(parsedLine as Record<string, unknown>);
      if (text) {
        extractedTexts.push(text);
      }
    } else {
      extractedTexts.push(line);
    }
  }

  return tryParseProposalPayload(extractedTexts.join("\n").trim());
};

const parsePlanResponse = (stdout: string): ProviderPlanResponse | undefined => {
  const direct = tryParsePlanPayload(stdout.trim());
  if (direct) {
    return direct;
  }

  const fenced = stdout.match(/```json\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    const parsed = tryParsePlanPayload(fenced.trim());
    if (parsed) {
      return parsed;
    }
  }

  const jsonLines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const extractedTexts: string[] = [];
  for (const line of jsonLines) {
    const parsedLine = tryParseJson(line);
    if (parsedLine && typeof parsedLine === "object") {
      const planPayload = tryParsePlanPayload(JSON.stringify(parsedLine));
      if (planPayload) {
        return planPayload;
      }

      const text = extractText(parsedLine as Record<string, unknown>);
      if (text) {
        extractedTexts.push(text);
      }
    } else {
      extractedTexts.push(line);
    }
  }

  return tryParsePlanPayload(extractedTexts.join("\n").trim());
};

const tryParseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const tryParseProposalPayload = (value: string): ProviderProposalResponse | undefined => {
  const parsed = tryParseJson(value);
  if (!parsed || typeof parsed !== "object" || !("proposals" in parsed)) {
    return undefined;
  }

  const proposals = (parsed as { proposals?: unknown }).proposals;
  if (!Array.isArray(proposals)) {
    return undefined;
  }

  return parsed as ProviderProposalResponse;
};

const tryParsePlanPayload = (value: string): ProviderPlanResponse | undefined => {
  const parsed = tryParseJson(value);
  if (!parsed || typeof parsed !== "object" || !("steps" in parsed)) {
    return undefined;
  }

  const steps = (parsed as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) {
    return undefined;
  }

  return parsed as ProviderPlanResponse;
};
