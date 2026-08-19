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
  onApplyAndValidate?: () => void;
}

export function StoryNavigatorPanel({
  workspace,
  selectedItem,
  onSelectItem,
  onSelectProject,
  onApprovePlan,
  onApplyAndValidate
}: StoryNavigatorPanelProps) {
  const tasks = workspace?.nextTaskPlan?.steps ?? [];
  const risks =
    workspace?.suggestions.filter((suggestion) => suggestion.severity !== "info").slice(0, 4) ?? [];
  const projects = workspace?.profile.projects ?? [];
  const reviewChecks = workspace?.proposedChanges.flatMap((proposal) => proposal.reviewChecks) ?? [];
  const unresolvedIssues = risks.filter((risk) => risk.reviewStatus !== "resolved");
  const isApplyingAndValidating = workspace?.validationResult.status === "running";
  const isPlanApproved = Boolean(
    workspace?.proposalState.status === "generating" ||
    workspace?.proposalState.status === "ready" ||
    workspace?.proposalState.status === "fallback" ||
    workspace?.proposedChanges.length
  );
  const lenses = (["security", "dry", "validation"] as const).map((lens) => {
    const checksForLens = reviewChecks.filter((check) => check.lens === lens);
    const issuesForLens = risks.filter((risk) => risk.lens === lens);
    const unresolvedForLens = issuesForLens.filter(
      (risk) => risk.reviewStatus !== "resolved"
    );
    const status = unresolvedForLens.some((risk) => risk.reviewStatus === "fixing")
      ? "fixing"
      : unresolvedForLens.some((risk) => risk.reviewStatus === "fix-proposed")
        ? "fix-proposed"
        : unresolvedForLens.length > 0
          ? "action"
          : checksForLens.length > 0
            ? "pass"
            : "none";

    return {
      lens,
      count: checksForLens.length,
      status,
      unresolvedCount: unresolvedForLens.length
    };
  });
  const applyBlockedReason = unresolvedIssues.length > 0
    ? "Resolve every open security, DRY, and validation issue before applying changes."
    : !workspace?.proposedChanges.length
      ? "No implementation result is ready to apply yet."
      : undefined;

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
            <span>Review issues</span>
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
                <span className={`badge badge--soft`}>
                  {risk.reviewStatus === "resolved"
                    ? "done"
                    : risk.reviewStatus === "fix-proposed"
                      ? "review fix"
                      : risk.reviewStatus === "fixing"
                        ? "fixing"
                        : "open"}
                </span>
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
                <button
                  type="button"
                  className="story-lens-card"
                  key={lens.lens}
                  onClick={() => {
                    const matchingIssue = risks.find(
                      (risk) => risk.lens === lens.lens && risk.reviewStatus !== "resolved"
                    );
                    if (matchingIssue) {
                      onSelectItem({
                        kind: "risk",
                        id: matchingIssue.id
                      });
                      return;
                    }

                    const matchingProposal = workspace?.proposedChanges.find((proposal) =>
                      proposal.reviewChecks.some((check) => check.lens === lens.lens)
                    );

                    if (matchingProposal) {
                      onSelectItem({
                        kind: "file",
                        id: matchingProposal.id,
                        filePath: matchingProposal.filePath
                      });
                    }
                  }}
                >
                  <div className="story-lens-card__top">
                    <span className={`badge badge--${lens.status === "action" ? "warning" : lens.status === "fixing" ? "soft" : lens.status === "fix-proposed" ? "info" : "info"}`}>
                      {lens.lens}
                    </span>
                    <span className="badge badge--soft">
                      {lens.count > 0 ? `${lens.count} checks` : "No checks"}
                    </span>
                  </div>
                  <strong>
                    {lens.status === "action"
                      ? "Open issues"
                      : lens.status === "fixing"
                        ? "Fix in progress"
                        : lens.status === "fix-proposed"
                          ? "Fix ready to review"
                          : lens.status === "pass"
                            ? "Checks complete"
                            : "Not yet available"}
                  </strong>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {tasks.length > 0 ? (
          <div className="story-panel__footer">
            {isPlanApproved ? (
              <div className="story-panel__footer-actions">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => onApplyAndValidate?.()}
                  disabled={
                    !workspace?.proposedChanges.length ||
                    isApplyingAndValidating ||
                    unresolvedIssues.length > 0
                  }
                >
                  {isApplyingAndValidating ? "Applying..." : "Apply and validate"}
                </button>
                {applyBlockedReason ? (
                  <p className="story-panel__footer-hint">{applyBlockedReason}</p>
                ) : null}
                {unresolvedIssues.length > 0 ? (
                  <p className="story-panel__footer-hint">
                    {unresolvedIssues.length} review issue{unresolvedIssues.length === 1 ? "" : "s"} still open.
                  </p>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                className="button-secondary"
                onClick={() => onApprovePlan?.()}
                disabled={isPlanApproved}
              >
                Approve plan for execution
              </button>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
