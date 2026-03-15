import type {
  AppSnapshot,
  AssistantMode,
  LoadingState,
  WorkspaceSnapshot,
  WorkspaceSummary
} from "../ipc/contracts.js";
import {
  defaultDotNetProfile,
  starterAzureFindings,
  starterSuggestions
} from "./sample-data.js";

const createWorkspaceSnapshot = (workspace: WorkspaceSummary): WorkspaceSnapshot => ({
  workspace,
  profile: defaultDotNetProfile,
  activeProjectId: undefined,
  activeFilePath: undefined,
  activeFileContents: undefined,
  activeFileDirty: false,
  assistantMode: "watching",
  suggestions: [...starterSuggestions],
  azureFindings: [...starterAzureFindings],
  providerStatuses: [],
  transcript: [
    {
      id: `system-${workspace.id}`,
      kind: "system",
      text: "Workspace ready. Open a local .NET solution and ask for an expert review to start a real provider session.",
      timestamp: Date.now()
    }
  ],
  sessionState: {
    active: false,
    status: "idle"
  },
  nextTaskPlan: undefined,
  planState: {
    status: "idle"
  },
  validationResult: {
    status: "idle",
    commands: []
  },
  proposedChanges: [],
  proposalState: {
    status: "idle"
  }
});

export class AppStateStore {
  private readonly workspaces = new Map<string, WorkspaceSnapshot>();
  private activeWorkspaceId = "";
  private loadingState: LoadingState | undefined;

  getSnapshot(): AppSnapshot {
    return {
      workspaces: Array.from(this.workspaces.values()),
      activeWorkspaceId: this.activeWorkspaceId,
      loadingState: this.loadingState
    };
  }

  upsertWorkspace(workspace: WorkspaceSummary): WorkspaceSnapshot {
    const existing = this.workspaces.get(workspace.id);
    const next = existing ? { ...existing, workspace } : createWorkspaceSnapshot(workspace);
    this.workspaces.set(workspace.id, next);
    if (!this.activeWorkspaceId) {
      this.activeWorkspaceId = workspace.id;
    }
    return next;
  }

  setActiveWorkspace(workspaceId: string): AppSnapshot {
    if (this.workspaces.has(workspaceId)) {
      this.activeWorkspaceId = workspaceId;
    }
    return this.getSnapshot();
  }

  setLoadingState(loadingState: LoadingState | undefined): AppSnapshot {
    this.loadingState = loadingState;
    return this.getSnapshot();
  }

  setAssistantMode(workspaceId: string, assistantMode: AssistantMode): AppSnapshot {
    const snapshot = this.workspaces.get(workspaceId);
    if (!snapshot) {
      return this.getSnapshot();
    }
    this.workspaces.set(workspaceId, { ...snapshot, assistantMode });
    return this.getSnapshot();
  }

  updateWorkspace(workspaceId: string, update: Partial<WorkspaceSnapshot>): AppSnapshot {
    const snapshot = this.workspaces.get(workspaceId);
    if (!snapshot) {
      return this.getSnapshot();
    }
    this.workspaces.set(workspaceId, { ...snapshot, ...update });
    return this.getSnapshot();
  }

  setActiveProject(workspaceId: string, projectId: string): AppSnapshot {
    const snapshot = this.workspaces.get(workspaceId);
    if (!snapshot) {
      return this.getSnapshot();
    }

    this.workspaces.set(workspaceId, {
      ...snapshot,
      activeProjectId: projectId,
      activeFilePath: undefined,
      activeFileContents: undefined,
      activeFileDirty: false
    });
    return this.getSnapshot();
  }

  setActiveFile(
    workspaceId: string,
    filePath: string,
    activeFileContents: string
  ): AppSnapshot {
    const snapshot = this.workspaces.get(workspaceId);
    if (!snapshot) {
      return this.getSnapshot();
    }

    this.workspaces.set(workspaceId, {
      ...snapshot,
      activeFilePath: filePath,
      activeFileContents,
      activeFileDirty: false
    });
    return this.getSnapshot();
  }

  updateActiveFile(workspaceId: string, activeFileContents: string): AppSnapshot {
    const snapshot = this.workspaces.get(workspaceId);
    if (!snapshot) {
      return this.getSnapshot();
    }

    this.workspaces.set(workspaceId, {
      ...snapshot,
      activeFileContents,
      activeFileDirty: true
    });
    return this.getSnapshot();
  }

  markActiveFileSaved(workspaceId: string): AppSnapshot {
    const snapshot = this.workspaces.get(workspaceId);
    if (!snapshot) {
      return this.getSnapshot();
    }

    this.workspaces.set(workspaceId, {
      ...snapshot,
      activeFileDirty: false
    });
    return this.getSnapshot();
  }

  appendTranscript(
    workspaceId: string,
    entry: WorkspaceSnapshot["transcript"][number]
  ): AppSnapshot {
    const snapshot = this.workspaces.get(workspaceId);
    if (!snapshot) {
      return this.getSnapshot();
    }

    this.workspaces.set(workspaceId, {
      ...snapshot,
      transcript: [...snapshot.transcript, entry]
    });
    return this.getSnapshot();
  }
}
