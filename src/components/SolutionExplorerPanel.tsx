import type { WorkspaceSnapshot } from "../../electron/ipc/contracts";

interface SolutionExplorerPanelProps {
  workspace?: WorkspaceSnapshot;
  onSelectProject: (projectId: string) => void;
}

export function SolutionExplorerPanel({
  workspace,
  onSelectProject
}: SolutionExplorerPanelProps) {
  const projects = workspace?.profile.projects ?? [];

  return (
    <section className="working-set">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Solution explorer</p>
          <h2>{workspace?.profile.primarySolutionFile ?? "No solution file detected"}</h2>
        </div>
        <span className="badge">{projects.length} projects</span>
      </div>

      {projects.length > 0 ? (
        <div className="solution-projects">
          {projects.map((project) => (
            <button
              type="button"
              className={`info-card solution-project ${
                workspace?.activeProjectId === project.id ? "solution-project--active" : ""
              }`}
              key={project.id}
              onClick={() => onSelectProject(project.id)}
            >
              <div className="info-card__row">
                <strong>{project.name}</strong>
                <span className="badge badge--soft">{project.projectType}</span>
              </div>
              <p>{project.relativePath}</p>
              <div className="solution-meta">
                <span>{project.targetFrameworks.join(", ") || "n/a"}</span>
                <span>
                  {project.references.length} reference{project.references.length === 1 ? "" : "s"}
                </span>
              </div>
              {project.references.length > 0 ? (
                <div className="solution-links">
                  {project.references.slice(0, 3).map((reference) => (
                    <span className="badge" key={reference}>
                      {reference.split("/").pop()?.replace(".csproj", "")}
                    </span>
                  ))}
                </div>
              ) : null}
            </button>
          ))}
        </div>
      ) : (
        <article className="info-card">
          <strong>Open a `.sln`-based workspace</strong>
          <p>The app will list projects here once it finds a solution file.</p>
        </article>
      )}
    </section>
  );
}
