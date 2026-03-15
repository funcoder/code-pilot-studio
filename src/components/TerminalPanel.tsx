import type { WorkspaceSnapshot } from "../../electron/ipc/contracts";

interface TerminalPanelProps {
  workspace?: WorkspaceSnapshot;
}

export function TerminalPanel({ workspace }: TerminalPanelProps) {
  const commands =
    workspace?.transcript
      .filter((entry) => entry.kind === "tool" || entry.kind === "error")
      .slice(-8)
      .map((entry) => entry.text) ??
    [];

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Execution</p>
          <h2>Recent command activity</h2>
        </div>
      </div>

      <div className="terminal">
        {(commands.length > 0
          ? commands
          : workspace?.nextTaskPlan?.commands ?? [
              "dotnet build",
              "dotnet test",
              "az resource list --output table"
            ]
        ).map((command) => (
          <div className="terminal__line" key={command}>
            <span className="terminal__prompt">$</span>
            <span>{command}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
