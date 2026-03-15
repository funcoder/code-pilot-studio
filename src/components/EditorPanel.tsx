import Editor from "@monaco-editor/react";
import type { WorkspaceSnapshot } from "../../electron/ipc/contracts";
import { ProjectFileTree } from "./ProjectFileTree";

interface EditorPanelProps {
  workspace?: WorkspaceSnapshot;
  onSelectFile: (filePath: string) => void;
  onChangeFile: (contents: string) => void;
  onSaveFile: () => void;
}

const demoCode = `var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSignalR();
builder.Services.AddOpenApi();

var app = builder.Build();

app.MapOpenApi();
app.MapHub<LiveUpdatesHub>("/hubs/live");

app.Run();

public sealed class LiveUpdatesHub : Hub
{
}
`;

const extensionToLanguage = (filePath?: string): string => {
  if (!filePath) {
    return "csharp";
  }

  const lower = filePath.toLowerCase();
  if (lower.endsWith(".cs")) {
    return "csharp";
  }
  if (lower.endsWith(".razor")) {
    return "razor";
  }
  if (lower.endsWith(".json")) {
    return "json";
  }
  if (lower.endsWith(".xaml")) {
    return "xml";
  }
  if (lower.endsWith(".http")) {
    return "plaintext";
  }
  return "plaintext";
};

export function EditorPanel({
  workspace,
  onSelectFile,
  onChangeFile,
  onSaveFile
}: EditorPanelProps) {
  const activeProject = workspace?.profile.projects.find(
    (project) => project.id === workspace.activeProjectId
  );
  const editorCode = workspace?.activeFileContents
    ? workspace.activeFileContents
    : activeProject
      ? `// Active project\n// ${activeProject.name}\n// ${activeProject.relativePath}\n\n// Type: ${activeProject.projectType}\n// Frameworks: ${activeProject.targetFrameworks.join(", ") || "n/a"}\n\n${
        activeProject.references.length > 0
          ? `// References:\n${activeProject.references.map((reference) => `// - ${reference}`).join("\n")}\n`
          : "// No direct project references\n"
      }\n${
        activeProject.startupFiles.length > 0
          ? `\n// Startup files:\n${activeProject.startupFiles.map((file) => `// - ${file}`).join("\n")}\n`
          : ""
      }`
      : demoCode;
  const fileLanguage = extensionToLanguage(workspace?.activeFilePath);

  return (
    <section className="panel panel--editor">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Editor</p>
          <h2>{activeProject?.name ?? workspace?.workspace.name ?? "Select a workspace"}</h2>
          <p className="muted">
            {workspace
              ? activeProject
                ? `${activeProject.projectType} project • ${workspace.activeFilePath ?? activeProject.relativePath}`
                : `${workspace.profile.projectCount} projects • ${workspace.profile.primarySolutionFile ?? "no .sln detected"}`
              : "Open a workspace to inspect solution structure and active stacks."}
          </p>
        </div>
        {workspace?.activeFilePath ? (
          <div className="editor-actions">
            <span className={`badge ${workspace.activeFileDirty ? "badge--warning" : "badge--info"}`}>
              {workspace.activeFileDirty ? "Unsaved" : "Saved"}
            </span>
            <button
              type="button"
              className="button-secondary"
              onClick={onSaveFile}
              disabled={!workspace.activeFileDirty}
            >
              Save file
            </button>
          </div>
        ) : null}
      </div>

      {activeProject ? (
        <div className="project-file-strip">
          <div className="summary-strip">
            <span className="summary-label">Startup</span>
            <div className="summary-pills">
              {(activeProject.startupFiles.length > 0
                ? activeProject.startupFiles
                : ["No startup file detected"]
              ).map((file) => (
                <span className="badge" key={file}>
                  {file.split("/").pop()}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="editor-workspace">
        <aside className="editor-sidebar">
          <div className="editor-sidebar__header">
            <span className="summary-label">Project files</span>
            <span className="badge badge--soft">
              {activeProject?.visibleFiles.length ?? 0} files
            </span>
          </div>
          <ProjectFileTree
            files={activeProject?.visibleFiles ?? []}
            activeFilePath={workspace?.activeFilePath}
            onSelectFile={onSelectFile}
          />
        </aside>

        <div className="editor-shell">
          <Editor
            defaultLanguage="csharp"
            language={fileLanguage}
            path={workspace?.activeFilePath}
            saveViewState
            value={editorCode}
            theme="vs-dark"
            onChange={(value) => onChangeFile(value ?? "")}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              smoothScrolling: true,
              padding: { top: 20 }
            }}
          />
        </div>
      </div>
    </section>
  );
}
