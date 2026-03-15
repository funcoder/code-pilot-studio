import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import type {
  AppSnapshot,
  AssistantSuggestion,
  ApproveTaskInput,
  GenerateProposalsInput,
  InspectAzureInput,
  OpenWorkspaceInput,
  RequestAdviceInput
} from "../ipc/contracts.js";
import { AppStateStore } from "./state.js";
import { AzureInspectionService } from "../services/azure-inspection.js";
import { DotNetExpertiseService } from "../services/dotnet-expertise.js";
import { ProviderService } from "../services/provider-service.js";
import { ReviewProposalService, buildReviewChecks } from "../services/review-proposal-service.js";
import { SolutionCheckService } from "../services/solution-check-service.js";
import { WorkspaceSeedService } from "../services/workspace-seed-service.js";
import { WorkspaceService } from "../services/workspace-service.js";

export class AppController {
  constructor(
    private readonly publishSnapshot: (snapshot: AppSnapshot) => void = () => {},
    private readonly state = new AppStateStore(),
    private readonly workspaceService = new WorkspaceService(),
    private readonly workspaceSeedService = new WorkspaceSeedService(),
    private readonly dotNetExpertiseService = new DotNetExpertiseService(),
    private readonly providerService = new ProviderService(),
    private readonly reviewProposalService = new ReviewProposalService(),
    private readonly solutionCheckService = new SolutionCheckService(),
    private readonly azureInspectionService = new AzureInspectionService()
  ) {}

  async seed(): Promise<AppSnapshot> {
    const existing = this.state.getSnapshot();
    if (existing.workspaces.length > 0) {
      return existing;
    }

    const candidates = await this.workspaceSeedService.findInitialWorkspaceCandidates(
      path.resolve(process.cwd(), "..")
    );
    const samples = await Promise.all(
      candidates.map((rootPath, index) =>
        this.workspaceService.createWorkspace({ rootPath }, index)
      )
    );

    for (const workspace of samples) {
      const snapshot = this.state.upsertWorkspace(workspace);
      await this.refreshWorkspace(snapshot.workspace);
    }

    return this.publish(this.state.getSnapshot());
  }

  getSnapshot(): AppSnapshot {
    return this.state.getSnapshot();
  }

  async openWorkspace(input: OpenWorkspaceInput): Promise<AppSnapshot> {
    const current = this.state.getSnapshot();
    const targetName = input.solutionPath
      ? path.basename(input.solutionPath, path.extname(input.solutionPath))
      : path.basename(input.rootPath);

    this.publish(this.state.setLoadingState({
      active: true,
      progress: 8,
      stage: "Opening solution",
      detail: "Preparing the solution window and workspace metadata.",
      targetName
    }));

    const existing = current.workspaces.find(
      (item) =>
        item.workspace.rootPath === input.rootPath &&
        item.workspace.solutionPath === input.solutionPath
    );

    if (existing) {
      this.publish(this.state.setLoadingState(undefined));
      return this.publish(this.state.setActiveWorkspace(existing.workspace.id));
    }

    const workspace = await this.workspaceService.createWorkspace(
      input,
      current.workspaces.length
    );
    this.publish(this.state.setLoadingState({
      active: true,
      progress: 18,
      stage: "Workspace created",
      detail: "Scanning the solution structure and project graph.",
      targetName: workspace.name
    }));
    this.state.upsertWorkspace(workspace);
    await this.refreshWorkspace(workspace);
    this.publish(this.state.setLoadingState(undefined));
    return this.publish(this.state.setActiveWorkspace(workspace.id));
  }

  setActiveWorkspace(workspaceId: string): AppSnapshot {
    return this.publish(this.state.setActiveWorkspace(workspaceId));
  }

  setActiveProject(workspaceId: string, projectId: string): AppSnapshot {
    const next = this.state.setActiveProject(workspaceId, projectId);
    const snapshot = next.workspaces.find((item) => item.workspace.id === workspaceId);
    if (snapshot) {
      void this.refreshProposals(snapshot.workspace.id);
    }
    return this.publish(next);
  }

  async setActiveFile(workspaceId: string, filePath: string): Promise<AppSnapshot> {
    const current = this.state.getSnapshot();
    const snapshot = current.workspaces.find(
      (item) => item.workspace.id === workspaceId
    );

    if (!snapshot) {
      return this.publish(current);
    }

    const absolutePath = path.join(snapshot.workspace.rootPath, filePath);
    const contents = await readFile(absolutePath, "utf8");
    return this.publish(this.state.setActiveFile(workspaceId, filePath, contents));
  }

  updateActiveFile(workspaceId: string, contents: string): AppSnapshot {
    return this.publish(this.state.updateActiveFile(workspaceId, contents));
  }

  async generateProposals(input: GenerateProposalsInput): Promise<AppSnapshot> {
    const current = this.state.getSnapshot();
    const snapshot = current.workspaces.find(
      (item) => item.workspace.id === input.workspaceId
    );

    if (!snapshot) {
      return this.publish(current);
    }

    this.publish(this.state.updateWorkspace(input.workspaceId, {
      proposalState: {
        ...snapshot.proposalState,
        status: "generating",
        summary: "Generating review proposals..."
      }
    }));

    return this.refreshProposals(input.workspaceId, {
      activeProjectId: snapshot.activeProjectId,
      prompt:
        input.prompt ??
        snapshot.nextTaskPlan?.goal ??
        "Prepare reviewable implementation proposals for the current .NET solution."
    });
  }

  async saveActiveFile(workspaceId: string): Promise<AppSnapshot> {
    const current = this.state.getSnapshot();
    const snapshot = current.workspaces.find(
      (item) => item.workspace.id === workspaceId
    );

    if (!snapshot || !snapshot.activeFilePath || snapshot.activeFileContents === undefined) {
      return this.publish(current);
    }

    const absolutePath = path.join(snapshot.workspace.rootPath, snapshot.activeFilePath);
    await writeFile(absolutePath, snapshot.activeFileContents, "utf8");
    return this.publish(this.state.markActiveFileSaved(workspaceId));
  }

  async runBuildCheck(workspaceId: string): Promise<AppSnapshot> {
    const current = this.state.getSnapshot();
    const snapshot = current.workspaces.find((item) => item.workspace.id === workspaceId);

    if (!snapshot) {
      return this.publish(current);
    }

    this.publish(this.state.updateWorkspace(workspaceId, {
      assistantMode: "executing"
    }));
    this.state.appendTranscript(workspaceId, {
      id: `tool-build-${Date.now()}`,
      kind: "tool",
      text: "Starting solution build and check...",
      timestamp: Date.now()
    });
    this.publish(this.state.getSnapshot());

    const result = await this.solutionCheckService.run(snapshot.workspace, snapshot.profile);
    for (const command of result.commands) {
      this.state.appendTranscript(workspaceId, {
        id: `tool-check-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        kind: result.ok ? "tool" : "error",
        text: command,
        timestamp: Date.now()
      });
    }

    this.state.appendTranscript(workspaceId, {
      id: `system-check-${Date.now()}`,
      kind: result.ok ? "system" : "error",
      text: result.summary,
      timestamp: Date.now()
    });

    return this.publish(this.state.updateWorkspace(workspaceId, {
      assistantMode: result.ok ? "watching" : "paused"
    }));
  }

  async requestAdvice(input: RequestAdviceInput): Promise<AppSnapshot> {
    const current = this.state.getSnapshot();
    const snapshot = current.workspaces.find(
      (item) => item.workspace.id === input.workspaceId
    );
    const workspace = snapshot?.workspace;

    if (!workspace || !snapshot) {
      return current;
    }

    const provider = this.providerService.getProvider(workspace.provider);
    const selectedProject = snapshot.profile.projects.find(
      (project) => project.id === snapshot.activeProjectId
    );
    const activeFilePrompt = snapshot.activeFilePath
      ? `\nActive file: ${snapshot.activeFilePath}`
      : "";
    const projectScopedPrompt = selectedProject
      ? `${input.prompt}\n\nActive project: ${selectedProject.name} (${selectedProject.relativePath})${activeFilePrompt}`
      : input.prompt;
    const suggestions = provider.buildSuggestions(
      workspace,
      snapshot.profile,
      projectScopedPrompt
    );
    this.state.appendTranscript(input.workspaceId, {
      id: `user-${Date.now()}`,
      kind: "user",
      text: projectScopedPrompt,
      timestamp: Date.now()
    });
    this.publish(this.state.updateWorkspace(input.workspaceId, {
      assistantMode: "executing",
      planState: {
        status: "generating",
        source: workspace.provider,
        summary: `Sending your request to ${workspace.provider} and preparing an implementation plan...`
      },
      sessionState: {
        active: true,
        provider: workspace.provider,
        status: "running",
        summary: `Sending your request to ${workspace.provider} and preparing an implementation plan...`
      }
    }));

    const providerLabel = workspace.provider === "claude-code" ? "Claude Code" : "Codex";
    const planningSummaries = [
      `${providerLabel} is inspecting the solution and current project context...`,
      `${providerLabel} is locating the files and services involved in this feature...`,
      `${providerLabel} is drafting the implementation steps for review...`,
      `${providerLabel} is shaping the review-ready plan and affected files...`
    ];

    let planningSummaryIndex = 0;
    const planningSummaryTimer = setInterval(() => {
      const latest = this.state.getSnapshot().workspaces.find(
        (item) => item.workspace.id === input.workspaceId
      );

      if (!latest || latest.sessionState.status !== "running") {
        clearInterval(planningSummaryTimer);
        return;
      }

      const nextSummary =
        planningSummaries[Math.min(planningSummaryIndex, planningSummaries.length - 1)];
      planningSummaryIndex += 1;

      this.publish(this.state.updateWorkspace(input.workspaceId, {
        assistantMode: "executing",
        planState: {
          status: "generating",
          source: workspace.provider,
          summary: nextSummary
        },
        sessionState: {
          active: true,
          provider: workspace.provider,
          status: "running",
          summary: nextSummary
        }
      }));

      if (planningSummaryIndex >= planningSummaries.length) {
        clearInterval(planningSummaryTimer);
      }
    }, 1200);

    let providerPlan;
    try {
      providerPlan = await this.providerService.generateStructuredTaskPlan(
        workspace,
        snapshot.profile,
        projectScopedPrompt
      );
    } finally {
      clearInterval(planningSummaryTimer);
    }
    this.publish(this.state.updateWorkspace(input.workspaceId, {
      planState: {
        status: providerPlan.taskPlan
          ? "ready"
          : providerPlan.failureReason
            ? "fallback"
            : "failed",
        source: providerPlan.taskPlan ? providerPlan.source : "local-fallback",
        summary: providerPlan.taskPlan
          ? `${workspace.provider} returned an implementation plan.`
          : providerPlan.failureReason ?? "No structured provider plan came back.",
        lastGeneratedAt: Date.now()
      },
      sessionState: {
        active: true,
        provider: workspace.provider,
        status: "running",
        summary: providerPlan.taskPlan
          ? `${workspace.provider} returned a plan. Preparing the review workspace...`
          : `No structured provider plan came back. Falling back to the local planner...`
      }
    }));
    const taskPlan = providerPlan.taskPlan ?? provider.planTask(
      workspace,
      snapshot.profile,
      projectScopedPrompt
    );
    void this.refreshProposals(input.workspaceId, {
      activeProjectId: snapshot.activeProjectId,
      prompt: projectScopedPrompt,
      taskPlan,
      suggestions
    });
    const next = this.state.updateWorkspace(input.workspaceId, {
      assistantMode: "executing",
      suggestions: [...suggestions, ...snapshot.suggestions],
      nextTaskPlan: taskPlan,
      sessionState: {
        active: true,
        provider: workspace.provider,
        status: "running",
        summary: "Plan ready. Starting provider session..."
      }
    });
    if (providerPlan.failureReason) {
      this.state.appendTranscript(input.workspaceId, {
        id: `plan-fallback-${Date.now()}`,
        kind: "system",
        text: `Plan generation fallback: ${providerPlan.failureReason}`,
        timestamp: Date.now()
      });
    } else {
      this.state.appendTranscript(input.workspaceId, {
        id: `plan-provider-${Date.now()}`,
        kind: "system",
        text: `Implementation plan generated by ${providerPlan.source}.`,
        timestamp: Date.now()
      });
    }
    const published = this.publish(this.state.getSnapshot());

    this.providerService.runPromptSession(
      workspace,
      snapshot.profile,
      projectScopedPrompt,
      {
        onEntry: (entry) => {
          const activity = this.providerService.interpretTranscriptEntry(entry, workspace.provider);
          if (activity.entry) {
            this.state.appendTranscript(input.workspaceId, activity.entry);
          }
          if (activity.summary) {
            const latest = this.state.getSnapshot().workspaces.find(
              (item) => item.workspace.id === input.workspaceId
            );
            this.state.updateWorkspace(input.workspaceId, {
              sessionState: {
                active: true,
                provider: workspace.provider,
                status: "running",
                summary: activity.summary
              },
              assistantMode: latest?.assistantMode ?? "executing"
            });
          }
          this.publish(this.state.getSnapshot());
        },
        onComplete: ({ success, summary }) => {
          this.state.updateWorkspace(input.workspaceId, {
            assistantMode: success ? "watching" : "paused",
            sessionState: {
              active: false,
              provider: workspace.provider,
              status: success ? "completed" : "failed",
              summary
            }
          });
          this.publish(this.state.getSnapshot());
        }
      }
    );

    return published ?? next;
  }

  async inspectAzure(input: InspectAzureInput): Promise<AppSnapshot> {
    const current = this.state.getSnapshot();
    const snapshot = current.workspaces.find(
      (item) => item.workspace.id === input.workspaceId
    );
    const workspace = snapshot?.workspace;

    if (!workspace || !snapshot) {
      return this.publish(current);
    }

    this.publish(this.state.setAssistantMode(input.workspaceId, "executing"));
    const findings = await this.azureInspectionService.inspect(workspace, snapshot.profile, input);
    return this.publish(this.state.updateWorkspace(input.workspaceId, {
      azureFindings: findings,
      assistantMode: "watching"
    }));
  }

  async approveTask(input: ApproveTaskInput): Promise<AppSnapshot> {
    const current = this.state.getSnapshot();
    const workspace = current.workspaces.find(
      (item) =>
        item.workspace.id === input.workspaceId &&
        item.nextTaskPlan?.id === input.taskPlanId
    );

    if (!workspace) {
      return this.publish(current);
    }

    this.state.appendTranscript(input.workspaceId, {
      id: `plan-approved-${Date.now()}`,
      kind: "system",
      text: "Plan approved. Generating reviewable code changes for the approved implementation plan.",
      timestamp: Date.now()
    });

    this.publish(this.state.updateWorkspace(input.workspaceId, {
      assistantMode: "awaiting-approval",
      proposalState: {
        status: "generating",
        source: workspace.workspace.provider,
        summary: "Executing the approved plan and preparing code changes for review."
      },
      sessionState: {
        active: true,
        provider: workspace.workspace.provider,
        status: "running",
        summary: "Executing the approved plan and preparing code changes for review."
      },
      suggestions: [
        {
          id: `approval-${Date.now()}`,
          title: "Plan approved for review execution",
          summary:
            "The assistant is now turning the approved implementation plan into reviewable code changes.",
          severity: "info",
          source: "provider"
        },
        ...workspace.suggestions
      ]
    }));

    const refreshed = await this.refreshProposals(input.workspaceId, {
      activeProjectId: workspace.activeProjectId,
      prompt: workspace.nextTaskPlan?.goal,
      taskPlan: workspace.nextTaskPlan,
      suggestions: workspace.suggestions
    });

    const refreshedWorkspace = refreshed.workspaces.find(
      (item) => item.workspace.id === input.workspaceId
    );

    return this.publish(this.state.updateWorkspace(input.workspaceId, {
      assistantMode: "watching",
      suggestions: refreshedWorkspace?.suggestions ?? workspace.suggestions,
      proposedChanges: refreshedWorkspace?.proposedChanges ?? workspace.proposedChanges,
      proposalState: refreshedWorkspace?.proposalState ?? workspace.proposalState,
      nextTaskPlan: refreshedWorkspace?.nextTaskPlan ?? workspace.nextTaskPlan,
      sessionState: {
        active: false,
        provider: workspace.workspace.provider,
        status: "completed",
        summary: "Approved plan executed. Review the generated code changes."
      }
    }));
  }

  private async refreshWorkspace(workspace: {
    id: string;
    name: string;
    rootPath: string;
    provider: "codex" | "claude-code";
  }): Promise<AppSnapshot> {
    this.publish(this.state.setLoadingState({
      active: true,
      progress: 34,
      stage: "Scanning solution",
      detail: "Reading the solution file, projects, and visible files.",
      targetName: workspace.name
    }));
    const profile = await this.dotNetExpertiseService.detectSolutionProfile(workspace);

    this.publish(this.state.setLoadingState({
      active: true,
      progress: 68,
      stage: "Checking tools",
      detail: "Verifying AI providers and solution capabilities.",
      targetName: workspace.name
    }));
    const providerStatuses = await this.providerService.getProviderStatuses();
    const suggestions: AssistantSuggestion[] = [
      {
        id: `review-${workspace.id}`,
        title: ".NET expertise pack active",
        summary: this.dotNetExpertiseService.createReviewPrompts(workspace, profile).join(" "),
        severity: "info" as const,
        source: "workspace" as const
      },
      {
        id: `scan-${workspace.id}`,
        title: "Workspace scan completed",
        summary: `Detected ${profile.projectCount} project(s), ${profile.solutionFiles.length} solution file(s), and ${profile.bicepFiles.length} Bicep file(s).`,
        severity: profile.projectCount > 0 ? "info" : "warning",
        source: "workspace"
      }
    ];

    const updated = this.state.updateWorkspace(workspace.id, {
      profile,
      activeProjectId: profile.projects[0]?.id,
      activeFilePath: profile.projects[0]?.visibleFiles[0],
      activeFileContents: undefined,
      activeFileDirty: false,
      providerStatuses,
      suggestions
    });
    this.publish(this.state.setLoadingState({
      active: true,
      progress: 92,
      stage: "Finalizing workspace",
      detail: "Preparing the solution view. Generate a plan when you're ready.",
      targetName: workspace.name
    }));
    return this.publish(updated);
  }

  private async refreshProposals(
    workspaceId: string,
    overrides: {
      activeProjectId?: string;
      prompt?: string;
      taskPlan?: AppSnapshot["workspaces"][number]["nextTaskPlan"];
      suggestions?: AppSnapshot["workspaces"][number]["suggestions"];
    } = {}
  ): Promise<AppSnapshot> {
    const snapshot = this.state.getSnapshot().workspaces.find(
      (item) => item.workspace.id === workspaceId
    );

    if (!snapshot) {
      return this.publish(this.state.getSnapshot());
    }

    const proposedChanges = await this.reviewProposalService.buildProposals(
      snapshot.workspace,
      snapshot.profile,
      {
        activeProjectId: overrides.activeProjectId ?? snapshot.activeProjectId,
        prompt: overrides.prompt,
        taskPlan: overrides.taskPlan ?? snapshot.nextTaskPlan,
        suggestions: overrides.suggestions ?? snapshot.suggestions
      }
    );
    const providerPrompt =
      overrides.prompt ??
      overrides.taskPlan?.goal ??
      snapshot.nextTaskPlan?.goal ??
      "Prepare reviewable implementation proposals for the current .NET solution.";
    const providerResult = await this.providerService.generateStructuredProposals(
      snapshot.workspace,
      snapshot.profile,
      providerPrompt
    );
    const providerProposals = providerResult.proposals?.map((proposal) => ({
      ...proposal,
      reviewChecks:
        proposal.reviewChecks ??
        buildReviewChecks(proposal.filePath, proposal.category, proposal.rationale)
    }));
    if (!providerProposals && providerResult.failureReason) {
      this.state.appendTranscript(workspaceId, {
        id: `proposal-failure-${Date.now()}`,
        kind: "system",
        text: `Proposal generation fallback: ${providerResult.failureReason}`,
        timestamp: Date.now()
      });
    }

    return this.publish(
      this.state.updateWorkspace(workspaceId, {
        proposedChanges: providerProposals && providerProposals.length > 0
          ? providerProposals
          : proposedChanges,
        proposalState: providerProposals && providerProposals.length > 0
          ? {
              status: "ready",
              source: providerResult.source,
              summary: `Generated ${providerProposals.length} proposal${providerProposals.length === 1 ? "" : "s"} from ${providerResult.source}.`,
              lastGeneratedAt: Date.now()
            }
          : proposedChanges.length > 0
            ? {
                status: "fallback",
                source: "local-fallback",
                summary: providerResult.failureReason
                  ? `Provider proposals unavailable: ${providerResult.failureReason}`
                  : "Provider proposals were unavailable, so local fallback proposals were generated.",
                lastGeneratedAt: Date.now()
              }
            : {
                status: "failed",
                source: providerResult.source ?? "local-fallback",
                summary: providerResult.failureReason ?? "No proposals could be generated for the current solution state.",
                lastGeneratedAt: Date.now()
              }
      })
    );
  }

  private publish(snapshot: AppSnapshot): AppSnapshot {
    this.publishSnapshot(snapshot);
    return snapshot;
  }
}
