import { useEffect, useState } from "react";
import type { RecentWorkspaceRecord } from "../electron/ipc/contracts";
import { desktopApi } from "./lib/desktopApi";

const formatRelativeDate = (timestamp: number): string => {
  const deltaHours = Math.max(1, Math.round((Date.now() - timestamp) / 3_600_000));
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }

  const deltaDays = Math.round(deltaHours / 24);
  return `${deltaDays}d ago`;
};

export function LauncherApp() {
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspaceRecord[]>([]);

  useEffect(() => {
    void desktopApi.getRecentWorkspaces().then(setRecentWorkspaces);
  }, []);

  const openFromDialog = async () => {
    const result = await desktopApi.openWorkspaceDialog();
    if (result.canceled || !result.rootPath) {
      return;
    }

    await desktopApi.openWorkspaceWindow({
      rootPath: result.rootPath,
      solutionPath: result.solutionPath
    });
    setRecentWorkspaces(await desktopApi.getRecentWorkspaces());
  };

  const createNewSolution = async () => {
    const result = await desktopApi.createWorkspaceDialog();
    if (result.canceled || !result.rootPath) {
      return;
    }

    await desktopApi.openWorkspaceWindow({
      rootPath: result.rootPath,
      solutionPath: result.solutionPath
    });
    setRecentWorkspaces(await desktopApi.getRecentWorkspaces());
  };

  const openRecent = async (workspace: RecentWorkspaceRecord) => {
    await desktopApi.openWorkspaceWindow({
      rootPath: workspace.rootPath,
      solutionPath: workspace.solutionPath
    });
    setRecentWorkspaces(await desktopApi.getRecentWorkspaces());
  };

  return (
    <main className="launcher-shell">
      <section className="launcher-hero">
        <div>
          <p className="eyebrow">Launcher</p>
          <h1>Open a solution and drop straight into code</h1>
          <p className="muted">
            One window per solution, with the editor and AI centered on the current codebase.
          </p>
        </div>

        <div className="launcher-actions">
          <button type="button" onClick={openFromDialog}>
            Open solution
          </button>
          <button type="button" className="button-secondary" onClick={createNewSolution}>
            Create workspace
          </button>
        </div>
      </section>

      <section className="launcher-grid">
        <section className="launcher-panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Recent</p>
              <h2>Solutions</h2>
            </div>
            <span className="badge">{recentWorkspaces.length}</span>
          </div>

          <div className="launcher-recents">
            {recentWorkspaces.length > 0 ? (
              recentWorkspaces.map((workspace) => (
                <button
                  type="button"
                  className="launcher-recent"
                  key={`${workspace.rootPath}-${workspace.solutionPath ?? ""}`}
                  onClick={() => openRecent(workspace)}
                >
                  <div className="workspace-card__row">
                    <strong>{workspace.name}</strong>
                    <span className="badge badge--soft">{formatRelativeDate(workspace.lastOpenedAt)}</span>
                  </div>
                  <p>{workspace.solutionPath ?? workspace.rootPath}</p>
                </button>
              ))
            ) : (
              <article className="info-card">
                <strong>No recent solutions yet</strong>
                <p>Open a local `.sln` or folder to start building your solution history.</p>
              </article>
            )}
          </div>
        </section>

        <section className="launcher-panel launcher-panel--accent">
          <p className="eyebrow">Why this flow</p>
          <h2>Built for solution focus</h2>
          <div className="checklist">
            <div className="checklist__item">
              <strong>One solution, one window</strong>
              <p>The code, project tree, and assistant all stay locked onto the same context.</p>
            </div>
            <div className="checklist__item">
              <strong>No workspace juggling in the editor</strong>
              <p>The editor window can spend its width on code and AI instead of acting like a launcher.</p>
            </div>
            <div className="checklist__item">
              <strong>Faster re-entry</strong>
              <p>Recent solutions give the app a proper IDE-style landing experience.</p>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
