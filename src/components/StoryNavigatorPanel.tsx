import type { WorkspaceSnapshot } from "../../electron/ipc/contracts";

export type StorySelection =
  | { kind: "task"; id: string; index: number }
  | { kind: "risk"; id: string }
  | { kind: "file"; id: string; filePath: string }
  | { kind: "project"; id: string; projectId: string };

interface StoryNavigatorPanelProps {
  workspace?: WorkspaceSnapshot;
  selectedItem?: StorySelection;
  onSelectItem: (selection: StorySelection) => void;
  onSelectProject: (projectId: string) => void;
  onApprovePlan?: () => void;
}

export function StoryNavigatorPanel({
  workspace,
  selectedItem,
  onSelectItem,
  onSelectProject,
  onApprovePlan
}: StoryNavigatorPanelProps) {
  const tasks = workspace?.nextTaskPlan?.steps ?? [];
  const risks = workspace?.suggestions.slice(0, 4) ?? [];
  const projects = workspace?.profile.projects ?? [];
  const reviewChecks = workspace?.proposedChanges.flatMap((proposal) => proposal.reviewChecks) ?? [];
  const isPlanApproved = Boolean(
    workspace?.proposalState.status === "generating" ||
    workspace?.proposalState.status === "ready" ||
    workspace?.proposalState.status === "fallback" ||
    workspace?.proposedChanges.length
  );
  const lenses = (["security", "dry", "validation"] as const).map((lens) => {
    const checksForLens = reviewChecks.filter((check) => check.lens === lens);
    const status = checksForLens.some((check) => check.status === "action")
      ? "action"
      : checksForLens.some((check) => check.status === "watch")
        ? "watch"
        : checksForLens.length > 0
          ? "pass"
          : "none";

    return {
      lens,
      count: checksForLens.length,
      status
    };
  });

  return (
    <section className="panel story-panel">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Review plan</p>
          <h2>Implementation steps</h2>
        </div>
        <span className="badge badge--soft">
          {tasks.length + risks.length + projects.length}
          {" "}items
        </span>
      </div>

      <div className="story-stack">
        {tasks.length > 0 ? (
          <section className="story-section">
            <div className="story-section__header">
              <span className="summary-label">Implementation steps</span>
              <span className="badge">{tasks.length}</span>
            </div>
            <div className="story-section__items">
              {tasks.map((task, index) => (
                <button
                  type="button"
                  key={`${task}-${index}`}
                  className={`story-item ${
                    selectedItem?.kind === "task" && selectedItem.index === index
                      ? "story-item--active"
                      : ""
                  }`}
                  onClick={() => onSelectItem({ kind: "task", id: `task-${index}`, index })}
                >
                  <span className="story-item__index">{index + 1}</span>
                  <span>{task}</span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <div className="story-empty-state">
            <strong>No implementation steps yet</strong>
            <p>Use the feature request bar above to generate a plan for this solution.</p>
          </div>
        )}

        <details className="story-disclosure">
          <summary>
            <span>Bugs and risks</span>
            <span className="badge">{risks.length}</span>
          </summary>
          <div className="story-section__items">
            {risks.map((risk) => (
              <button
                type="button"
                key={risk.id}
                className={`story-item ${
                  selectedItem?.kind === "risk" && selectedItem.id === risk.id
                    ? "story-item--active"
                    : ""
                }`}
                onClick={() => onSelectItem({ kind: "risk", id: risk.id })}
              >
                <span className={`badge badge--${risk.severity}`}>{risk.severity}</span>
                <span>{risk.title}</span>
              </button>
            ))}
          </div>
        </details>

        <details className="story-disclosure">
          <summary>
            <span>Solution context</span>
            <span className="badge">{projects.length}</span>
          </summary>
          <div className="story-section__items">
            {projects.map((project) => (
              <button
                type="button"
                key={project.id}
                className={`story-item ${
                  selectedItem?.kind === "project" && selectedItem.projectId === project.id
                    ? "story-item--active"
                    : ""
                }`}
                onClick={() => {
                  onSelectProject(project.id);
                  onSelectItem({ kind: "project", id: `project-${project.id}`, projectId: project.id });
                }}
              >
                <span className="badge">{project.projectType}</span>
                <span>{project.name}</span>
              </button>
            ))}
          </div>
        </details>

        {reviewChecks.length > 0 ? (
          <section className="story-section story-section--checks">
            <div className="story-section__header">
              <span className="summary-label">Review lenses</span>
              <span className="badge">{reviewChecks.length}</span>
            </div>
            <div className="story-lens-grid">
              {lenses.map((lens) => (
                <div className="story-lens-card" key={lens.lens}>
                  <div className="story-lens-card__top">
                    <span className={`badge badge--${lens.status === "action" ? "warning" : lens.status === "watch" ? "soft" : "info"}`}>
                      {lens.lens}
                    </span>
                    <span className="badge badge--soft">
                      {lens.count > 0 ? `${lens.count} checks` : "No checks"}
                    </span>
                  </div>
                  <strong>
                    {lens.status === "action"
                      ? "Needs attention"
                      : lens.status === "watch"
                        ? "Review carefully"
                        : lens.status === "pass"
                          ? "Looks covered"
                          : "Not yet available"}
                  </strong>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {tasks.length > 0 ? (
          <div className="story-panel__footer">
            <button
              type="button"
              className="button-secondary"
              onClick={() => onApprovePlan?.()}
              disabled={isPlanApproved}
            >
              {isPlanApproved ? "Plan approved" : "Approve plan for execution"}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
