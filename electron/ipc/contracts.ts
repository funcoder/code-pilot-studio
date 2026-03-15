export type AgentProviderKind = "codex" | "claude-code";

export type AssistantMode =
  | "watching"
  | "suggesting"
  | "awaiting-approval"
  | "executing"
  | "paused";

export type StackKind =
  | "dotnet"
  | "aspnet-core"
  | "blazor"
  | "signalr"
  | "maui"
  | "bicep"
  | "azure";

export interface WorkspaceSummary {
  id: string;
  name: string;
  rootPath: string;
  solutionPath?: string;
  provider: AgentProviderKind;
}

export interface StackDetection {
  kind: StackKind;
  confidence: number;
  evidence: string[];
}

export interface SolutionProject {
  id: string;
  name: string;
  relativePath: string;
  targetFrameworks: string[];
  projectType:
    | "web"
    | "blazor"
    | "maui"
    | "library"
    | "test"
    | "worker"
    | "unknown";
  references: string[];
  startupFiles: string[];
  visibleFiles: string[];
}

export interface DotNetSolutionProfile {
  targetFrameworks: string[];
  usesPreviewSdk: boolean;
  appModels: string[];
  detectedStacks: StackDetection[];
  solutionFiles: string[];
  projectFiles: string[];
  bicepFiles: string[];
  projectCount: number;
  primarySolutionFile?: string;
  projects: SolutionProject[];
}

export interface AssistantSuggestion {
  id: string;
  title: string;
  summary: string;
  severity: "info" | "warning" | "critical";
  source: "workspace" | "provider" | "azure";
  recommendation?: string;
  lens?: ReviewCheck["lens"];
  relatedFilePath?: string;
  relatedProjectId?: string;
  relatedProposalId?: string;
  actionPrompt?: string;
}

export interface TranscriptEntry {
  id: string;
  kind: "user" | "assistant" | "system" | "tool" | "error";
  text: string;
  timestamp: number;
}

export interface ProviderSessionState {
  active: boolean;
  provider?: AgentProviderKind;
  status: "idle" | "running" | "completed" | "failed";
  summary?: string;
}

export interface ProviderStatus {
  kind: AgentProviderKind;
  installed: boolean;
  command: string;
  version?: string;
  error?: string;
}

export interface AzureFinding {
  id: string;
  resourceName: string;
  category: string;
  severity: "info" | "warning" | "critical";
  summary: string;
  recommendation: string;
}

export interface TaskPlan {
  id: string;
  goal: string;
  steps: string[];
  commands: string[];
  files: string[];
}

export interface ReviewCheck {
  id: string;
  lens: "security" | "dry" | "validation";
  status: "pass" | "watch" | "action";
  title: string;
  detail: string;
}

export interface ProposedChange {
  id: string;
  title: string;
  summary: string;
  category: "task" | "bug" | "risk";
  source: AgentProviderKind | "local-fallback";
  filePath: string;
  projectId?: string;
  taskIndex?: number;
  originalContents: string;
  proposedContents: string;
  rationale: string[];
  reviewChecks: ReviewCheck[];
}

export interface ProposalState {
  status: "idle" | "generating" | "ready" | "fallback" | "failed";
  source?: AgentProviderKind | "local-fallback";
  summary?: string;
  lastGeneratedAt?: number;
}

export interface PlanState {
  status: "idle" | "generating" | "ready" | "fallback" | "failed";
  source?: AgentProviderKind | "local-fallback";
  summary?: string;
  lastGeneratedAt?: number;
}

export interface ValidationResult {
  status: "idle" | "running" | "passed" | "failed";
  summary?: string;
  commands: string[];
  appliedFiles?: string[];
  lastRunAt?: number;
}

export interface WorkspaceSnapshot {
  workspace: WorkspaceSummary;
  profile: DotNetSolutionProfile;
  activeProjectId?: string;
  activeFilePath?: string;
  activeFileContents?: string;
  activeFileDirty?: boolean;
  assistantMode: AssistantMode;
  suggestions: AssistantSuggestion[];
  azureFindings: AzureFinding[];
  providerStatuses: ProviderStatus[];
  transcript: TranscriptEntry[];
  sessionState: ProviderSessionState;
  nextTaskPlan?: TaskPlan;
  planState: PlanState;
  validationResult: ValidationResult;
  proposedChanges: ProposedChange[];
  proposalState: ProposalState;
}

export interface LoadingState {
  active: boolean;
  progress: number;
  stage: string;
  detail?: string;
  targetName?: string;
}

export interface AppSnapshot {
  workspaces: WorkspaceSnapshot[];
  activeWorkspaceId: string;
  loadingState?: LoadingState;
}

export interface OpenWorkspaceInput {
  rootPath: string;
  solutionPath?: string;
}

export interface RequestAdviceInput {
  workspaceId: string;
  prompt: string;
}

export interface InspectAzureInput {
  workspaceId: string;
  subscription?: string;
}

export interface ApproveTaskInput {
  workspaceId: string;
  taskPlanId: string;
}

export interface SetActiveProjectInput {
  workspaceId: string;
  projectId: string;
}

export interface SetActiveFileInput {
  workspaceId: string;
  filePath: string;
}

export interface UpdateActiveFileInput {
  workspaceId: string;
  contents: string;
}

export interface SaveActiveFileInput {
  workspaceId: string;
}

export interface GenerateProposalsInput {
  workspaceId: string;
  prompt?: string;
}

export interface RunBuildCheckInput {
  workspaceId: string;
}

export interface ApplyAndValidateInput {
  workspaceId: string;
}

export interface SnapshotListener {
  unsubscribe: () => void;
}

export interface OpenWorkspaceDialogResult {
  canceled: boolean;
  rootPath?: string;
  solutionPath?: string;
}

export interface RecentWorkspaceRecord {
  name: string;
  rootPath: string;
  solutionPath?: string;
  lastOpenedAt: number;
}
