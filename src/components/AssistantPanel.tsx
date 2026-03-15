import type { WorkspaceSnapshot } from "../../electron/ipc/contracts";

interface AssistantPanelProps {
  workspace?: WorkspaceSnapshot;
  onFixValidationIssue?: () => void;
}

export function AssistantPanel({
  workspace,
  onFixValidationIssue
}: AssistantPanelProps) {
  const activeProject = workspace?.profile.projects.find(
    (project) => project.id === workspace.activeProjectId
  );

  return (
    <section className="panel panel--assistant">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Review thread</p>
          <h2>Keep steering the change</h2>
        </div>
        <span className="badge">{workspace?.assistantMode ?? "idle"}</span>
      </div>

      <section className="assistant-focus">
        <div className="assistant-focus__item">
          <span className="summary-label">Project</span>
          <strong>{activeProject?.name ?? "No project selected"}</strong>
        </div>
        <div className="assistant-focus__item">
          <span className="summary-label">File</span>
          <strong>{workspace?.activeFilePath?.split("/").pop() ?? "No file selected"}</strong>
        </div>
      </section>

      {workspace?.proposalState ? (
        <article className="task-plan assistant-status-card">
          <p className="eyebrow">Proposal status</p>
          <div className="assistant-proposal-state">
            <span className={`badge badge--${workspace.proposalState.status === "failed" ? "critical" : workspace.proposalState.status === "fallback" ? "warning" : "info"}`}>
              {workspace.proposalState.status}
            </span>
            <span className="badge badge--soft">
              {workspace.proposalState.source ?? "unknown"}
            </span>
          </div>
          <p>{workspace.proposalState.summary ?? "No proposal state available yet."}</p>
        </article>
      ) : null}

      {workspace && workspace.validationResult.status !== "idle" ? (
        <article className="task-plan assistant-status-card">
          <p className="eyebrow">Validation result</p>
          <div className="assistant-proposal-state">
            <span className={`badge badge--${workspace.validationResult.status === "failed" ? "critical" : workspace.validationResult.status === "passed" ? "info" : "warning"}`}>
              {workspace.validationResult.status}
            </span>
            {workspace.validationResult.appliedFiles?.length ? (
              <span className="badge badge--soft">
                {workspace.validationResult.appliedFiles.length} file(s) applied
              </span>
            ) : null}
          </div>
          <p>{workspace.validationResult.summary ?? "Validation has not completed yet."}</p>
          {workspace.validationResult.commands.length ? (
            <div className="assistant-validation-commands">
              {workspace.validationResult.commands.slice(0, 3).map((command) => (
                <code key={command}>{command}</code>
              ))}
            </div>
          ) : null}
          {workspace.validationResult.status === "failed" ? (
            <div className="button-row">
              <button
                type="button"
                className="button-secondary"
                onClick={() => onFixValidationIssue?.()}
              >
                Fix validation issue
              </button>
            </div>
          ) : null}
        </article>
      ) : null}

      {workspace?.transcript.length ? (
        <article className="task-plan assistant-transcript">
          <p className="eyebrow">Live thread</p>
          {workspace && workspace.sessionState.status === "running" ? (
            <div className="assistant-live-summary">
              <span className="badge badge--info">thinking</span>
              <p>{workspace.sessionState.summary ?? "The assistant is working through your request."}</p>
            </div>
          ) : null}
          <div className="transcript transcript--assistant">
            {workspace.transcript.slice(-6).map((entry) => (
              <div className={`transcript__entry transcript__entry--${entry.kind}`} key={entry.id}>
                <span className="transcript__kind">{entry.kind}</span>
                <p>{entry.text}</p>
              </div>
            ))}
          </div>
        </article>
      ) : null}

      <details className="assistant-details">
        <summary>Assistant details</summary>
        <div className="assistant-details__body">
          <div className="assistant-summary">
            <div>
              <span className="summary-label">Session</span>
              <strong>{workspace?.sessionState.status ?? "idle"}</strong>
              <p>{workspace?.sessionState.summary ?? "Ready for a prompt."}</p>
            </div>
            <div>
              <span className="summary-label">Provider</span>
              <strong>{workspace?.workspace.provider ?? "n/a"}</strong>
              <p>
                {workspace?.providerStatuses.find(
                  (status) => status.kind === workspace.workspace.provider
                )?.version ??
                  workspace?.providerStatuses.find(
                    (status) => status.kind === workspace.workspace.provider
                  )?.error ??
                  "Checking tool availability"}
              </p>
            </div>
          </div>

          {workspace?.nextTaskPlan ? (
            <article className="task-plan assistant-plan">
              <p className="eyebrow">Approved plan</p>
              <h3>{workspace.nextTaskPlan.goal}</h3>
              <ul>
                {workspace.nextTaskPlan.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </article>
          ) : null}

          {workspace?.suggestions.length ? (
            <article className="task-plan">
              <p className="eyebrow">Next moves</p>
              <div className="checklist">
                {workspace.suggestions.slice(0, 3).map((suggestion) => (
                  <div className="checklist__item" key={suggestion.id}>
                    <strong>{suggestion.title}</strong>
                    <p>{suggestion.summary}</p>
                  </div>
                ))}
              </div>
            </article>
          ) : null}
        </div>
      </details>
    </section>
  );
}
