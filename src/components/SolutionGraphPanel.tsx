import type { WorkspaceSnapshot } from "../../electron/ipc/contracts";

interface SolutionGraphPanelProps {
  workspace?: WorkspaceSnapshot;
}

export function SolutionGraphPanel({ workspace }: SolutionGraphPanelProps) {
  const projects = workspace?.profile.projects ?? [];
  const activeProject = projects.find((project) => project.id === workspace?.activeProjectId);
  const visibleProjects = activeProject
    ? [activeProject, ...projects.filter((project) => activeProject.references.includes(project.id))]
    : projects;

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Project interactions</p>
          <h2>How the solution fits together</h2>
        </div>
      </div>

      {projects.length > 0 ? (
        <div className="graph-list">
          {visibleProjects.map((project) => (
            <article
              className={`info-card ${workspace?.activeProjectId === project.id ? "solution-project--active" : ""}`}
              key={project.id}
            >
              <div className="info-card__row">
                <strong>{project.name}</strong>
                <span className="badge">{project.projectType}</span>
              </div>
              <p>
                Depends on{" "}
                {project.references.length > 0
                  ? project.references
                      .map((reference) => reference.split("/").pop()?.replace(".csproj", ""))
                      .join(", ")
                  : "no direct project references"}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <article className="info-card">
          <strong>No project graph yet</strong>
          <p>Once a solution is parsed, project references will appear here.</p>
        </article>
      )}
    </section>
  );
}
