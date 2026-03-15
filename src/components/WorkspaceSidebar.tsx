import type { WorkspaceSnapshot } from "../../electron/ipc/contracts";

interface WorkspaceSidebarProps {
  workspaces: WorkspaceSnapshot[];
  activeWorkspaceId: string;
  onSelect: (workspaceId: string) => void;
  onOpenWorkspace: () => void;
}

export function WorkspaceSidebar({
  workspaces,
  activeWorkspaceId,
  onSelect,
  onOpenWorkspace
}: WorkspaceSidebarProps) {
  const activeWorkspace = workspaces.find(
    (workspaceSnapshot) => workspaceSnapshot.workspace.id === activeWorkspaceId
  );

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <p className="eyebrow">Solution rail</p>
        <h1>AI Coder</h1>
        <p className="muted">Keep navigation light. Stay in code.</p>
      </div>

      <div className="workspace-list">
        <section className="prompt-box prompt-box--compact">
          <span>Open another solution</span>
          <p className="muted">Start a new window for a different codebase.</p>
          <button type="button" onClick={onOpenWorkspace}>
            Open workspace
          </button>
        </section>

        {activeWorkspace ? (
          <>
            <div className="sidebar__section-header">
              <span className="summary-label">Current</span>
              <strong>{activeWorkspace.profile.projectCount}</strong>
            </div>

            <button
              className="workspace-card workspace-card--active"
              onClick={() => onSelect(activeWorkspace.workspace.id)}
              type="button"
            >
              <div className="workspace-card__row">
                <strong>{activeWorkspace.workspace.name}</strong>
                <span className="badge">{activeWorkspace.workspace.provider}</span>
              </div>
              <p>{activeWorkspace.profile.primarySolutionFile ?? activeWorkspace.workspace.name}</p>
              <div className="workspace-card__row">
                <span>{activeWorkspace.profile.targetFrameworks.join(", ")}</span>
                <span>{activeWorkspace.profile.projectCount} projects</span>
              </div>
              <div className="workspace-card__row">
                <span>{activeWorkspace.profile.bicepFiles.length} Bicep</span>
                <span>{activeWorkspace.activeFilePath?.split("/").pop() ?? "no file"}</span>
              </div>
            </button>
          </>
        ) : null}
      </div>
    </aside>
  );
}
