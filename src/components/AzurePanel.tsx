import type { WorkspaceSnapshot } from "../../electron/ipc/contracts";

interface AzurePanelProps {
  workspace?: WorkspaceSnapshot;
  onInspectAzure: () => void;
}

export function AzurePanel({ workspace, onInspectAzure }: AzurePanelProps) {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Azure</p>
          <h2>Environment findings</h2>
        </div>
        <button type="button" className="button-secondary" onClick={onInspectAzure}>
          Refresh inspection
        </button>
      </div>

      <div className="card-stack">
        {workspace?.azureFindings.slice(0, 3).map((finding) => (
          <article className="info-card" key={finding.id}>
            <div className="info-card__row">
              <strong>{finding.resourceName}</strong>
              <span className={`badge badge--${finding.severity}`}>
                {finding.severity}
              </span>
            </div>
            <p className="muted">{finding.category}</p>
            <p>{finding.summary}</p>
            <p className="recommendation">{finding.recommendation}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
