import { DiffEditor } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import type { editor as MonacoEditor } from "monaco-editor";
import type {
  AssistantSuggestion,
  ReviewCheck,
  WorkspaceSnapshot
} from "../../electron/ipc/contracts";
import type { StorySelection } from "./StoryNavigatorPanel";

interface ChangeReviewPanelProps {
  workspace?: WorkspaceSnapshot;
  selection?: StorySelection;
  onApplyProposal: (contents: string) => void;
  onEditProposal: (contents: string) => void;
  onSaveFile: () => void;
  onRunBuildCheck: () => void;
  onFixRisk?: (prompt: string) => void;
}

const extensionToLanguage = (filePath?: string): string => {
  if (!filePath) {
    return "markdown";
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
  return "plaintext";
};

interface DiffChunk {
  id: string;
  startLine: number;
  endLine: number;
  focusLine: number;
  kind: "add" | "remove" | "change";
  added: number;
  removed: number;
}

interface DiffOverview {
  chunks: DiffChunk[];
  added: number;
  removed: number;
  changed: number;
}

interface SelectionNarrative {
  title: string;
  summary: string;
  rationale: string[];
  code: string;
  proposedCode: string;
  filePath?: string;
  taskLabel: string;
  taskSummary: string;
  taskFiles: string[];
  reviewChecks: ReviewCheck[];
  issue?: {
    title: string;
    severity: AssistantSuggestion["severity"];
    source: AssistantSuggestion["source"];
    lens?: AssistantSuggestion["lens"];
    recommendation?: string;
    actionPrompt?: string;
  };
}

const getDiffOverview = (original: string, modified: string): DiffOverview => {
  const originalLines = original.split("\n");
  const modifiedLines = modified.split("\n");
  const maxLength = Math.max(originalLines.length, modifiedLines.length);
  const chunks: DiffChunk[] = [];
  let added = 0;
  let removed = 0;
  let changed = 0;
  let lineIndex = 0;

  while (lineIndex < maxLength) {
    if (originalLines[lineIndex] === modifiedLines[lineIndex]) {
      lineIndex += 1;
      continue;
    }

    const startLine = lineIndex + 1;
    let chunkAdded = 0;
    let chunkRemoved = 0;
    let chunkChanged = 0;

    while (lineIndex < maxLength && originalLines[lineIndex] !== modifiedLines[lineIndex]) {
      const originalLine = originalLines[lineIndex];
      const modifiedLine = modifiedLines[lineIndex];

      if (originalLine === undefined && modifiedLine !== undefined) {
        added += 1;
        chunkAdded += 1;
      } else if (originalLine !== undefined && modifiedLine === undefined) {
        removed += 1;
        chunkRemoved += 1;
      } else {
        changed += 1;
        chunkChanged += 1;
      }

      lineIndex += 1;
    }

    const kind: DiffChunk["kind"] =
      chunkAdded > 0 && chunkRemoved === 0 && chunkChanged === 0
        ? "add"
        : chunkRemoved > 0 && chunkAdded === 0 && chunkChanged === 0
          ? "remove"
          : "change";

    chunks.push({
      id: `chunk-${chunks.length + 1}`,
      startLine,
      endLine: lineIndex,
      focusLine: startLine,
      kind,
      added: chunkAdded,
      removed: chunkRemoved
    });
  }

  return {
    chunks,
    added,
    removed,
    changed
  };
};

const getSelectionNarrative = (
  workspace: WorkspaceSnapshot | undefined,
  selection: StorySelection | undefined
): SelectionNarrative => {
  const activeProject = workspace?.profile.projects.find(
    (project) => project.id === workspace?.activeProjectId
  );
  const taskPlan = workspace?.nextTaskPlan;
  const selectedRisk =
    selection?.kind === "risk"
      ? workspace?.suggestions.find((item) => item.id === selection.id)
      : undefined;
  const selectedProposal =
    selection?.kind === "file"
      ? workspace?.proposedChanges.find((proposal) => proposal.id === selection.id)
      : selection?.kind === "task"
        ? workspace?.proposedChanges.find((proposal) => proposal.taskIndex === selection.index)
        : selection?.kind === "risk"
          ? workspace?.proposedChanges.find(
              (proposal) =>
                proposal.id === selectedRisk?.relatedProposalId ||
                proposal.filePath === selectedRisk?.relatedFilePath
            )
          : selection?.kind === "project"
            ? workspace?.proposedChanges.find((proposal) => proposal.projectId === selection.projectId)
            : workspace?.proposedChanges[0];

  if (!workspace || !selection) {
    return {
      title: "Select an implementation item",
      summary: "Choose a step, issue, or file from the left to inspect the AI's reasoning and code proof.",
      rationale: [
        "The review plan is designed to explain intent before showing code.",
        "Each file-level review item can now point at a persisted proposed change."
      ],
      code: workspace?.activeFileContents ?? "// No active review item yet.",
      proposedCode: selectedProposal?.proposedContents ?? workspace?.activeFileContents ?? "// No active review item yet.",
      filePath: workspace?.activeFilePath,
      taskLabel: "No task selected",
      taskSummary: "Pick a task or code change to see the implementation step and its related diff.",
      taskFiles: [],
      reviewChecks: selectedProposal?.reviewChecks ?? []
    };
  }

  if (selection.kind === "task") {
    const step = taskPlan?.steps[selection.index];
    const taskFiles =
      taskPlan?.files.filter((file) =>
        selectedProposal ? file.includes(selectedProposal.filePath.split("/").pop() ?? "") : false
      ) ?? [];
    const hasTaskProposal = Boolean(selectedProposal);
    return {
      title: step ?? "Task detail",
      summary:
        "This task represents a concrete part of the delivery plan. Use the conversation below to ask for revisions or a different implementation strategy.",
      rationale: [
        `Impacted files: ${(taskPlan?.files ?? []).join(", ") || "No files attached yet."}`,
        `Execution trail: ${(taskPlan?.commands ?? []).join(" | ") || "No commands planned yet."}`,
        activeProject
          ? `Current review target: ${activeProject.name}.`
          : "Select a project for more focused implementation guidance."
      ],
      code: hasTaskProposal
        ? selectedProposal!.originalContents
        : "// No code change is attached to this implementation step yet.",
      proposedCode: hasTaskProposal
        ? selectedProposal!.proposedContents
        : "// Generate or select a concrete code change to review the diff for this step.",
      filePath: hasTaskProposal ? selectedProposal!.filePath : undefined,
      taskLabel: step ?? "Task detail",
      taskSummary:
        "This is the current implementation step. Review the impact, then inspect the code proof below.",
      taskFiles,
      reviewChecks: hasTaskProposal ? selectedProposal!.reviewChecks : []
    };
  }

  if (selection.kind === "risk") {
    const risk = selectedRisk;
    const riskFilePath = risk?.relatedFilePath ?? selectedProposal?.filePath;
    return {
      title: risk?.title ?? "Risk review",
      summary:
        risk?.summary ??
        "This item flags a potential bug, design issue, or follow-up concern that should be resolved before changes are applied.",
      rationale: [
        `Severity: ${risk?.severity ?? "info"}`,
        `Source: ${risk?.source ?? "workspace"}`,
        riskFilePath ? `Related file: ${riskFilePath}` : "No related file has been attached yet.",
        risk?.recommendation ??
          "Use this area to decide whether to ask the AI for a fix, explanation, or safer alternative."
      ],
      code:
        selectedProposal?.originalContents ??
        "// No concrete file diff is attached to this issue yet.",
      proposedCode:
        selectedProposal?.proposedContents ??
        "// Ask the AI to fix this issue to generate a concrete implementation result.",
      filePath: riskFilePath,
      taskLabel: risk?.title ?? "Risk review",
      taskSummary:
        "Use this issue review to understand the problem, inspect the related code, and choose whether to fix it with AI or edit it manually.",
      taskFiles: riskFilePath ? [riskFilePath] : [],
      reviewChecks:
        selectedProposal?.reviewChecks.filter(
          (check) => !risk?.lens || check.lens === risk.lens
        ) ?? [],
      issue: risk
        ? {
            title: risk.title,
            severity: risk.severity,
            source: risk.source,
            lens: risk.lens,
            recommendation: risk.recommendation,
            actionPrompt: risk.actionPrompt
          }
        : undefined
    };
  }

  if (selection.kind === "project") {
    const project = workspace.profile.projects.find((item) => item.id === selection.projectId);
    return {
      title: project?.name ?? "Project context",
      summary:
        "Project context helps the AI explain how a change fits into the wider solution, especially for multi-file or architectural work.",
      rationale: [
        `Frameworks: ${project?.targetFrameworks.join(", ") || "n/a"}`,
        `References: ${project?.references.length ?? 0}`,
        `Type: ${project?.projectType ?? "unknown"}`
      ],
      code: workspace.activeFileContents ?? "// Project context is shown through the active file.",
      proposedCode:
        selectedProposal?.proposedContents ?? workspace.activeFileContents ?? "// Project context is shown through the active file.",
      filePath: workspace.activeFilePath,
      taskLabel: project?.name ?? "Project context",
      taskSummary: "Project context shows how the selected change fits into the wider solution.",
      taskFiles: project?.visibleFiles.slice(0, 4) ?? [],
      reviewChecks: selectedProposal?.reviewChecks ?? []
    };
  }

  const fileProposal =
    selectedProposal ??
    workspace?.proposedChanges.find((proposal) => proposal.filePath === selection.filePath);
  return {
    title: fileProposal?.title ?? selection.filePath.split("/").pop() ?? "File review",
    summary:
      fileProposal?.summary ??
      "This is the code proof for the selected change. The diff now comes from an explicit proposed file change.",
    rationale: [
      ...(fileProposal?.rationale ?? []),
      `Full path: ${selection.filePath}`,
      activeProject ? `Project: ${activeProject.name}` : "No active project",
      workspace.activeFileDirty
        ? "The file has local unsaved edits."
        : "The file on the right matches the current saved workspace state."
    ],
    code: fileProposal?.originalContents ?? workspace.activeFileContents ?? "// No file contents loaded.",
    proposedCode:
      fileProposal?.proposedContents ?? workspace.activeFileContents ?? "// No file contents loaded.",
    filePath: selection.filePath,
    taskLabel:
      fileProposal?.taskIndex !== undefined && taskPlan?.steps[fileProposal.taskIndex]
        ? taskPlan.steps[fileProposal.taskIndex]
        : "File change review",
    taskSummary:
      "This file change belongs to the selected implementation step. Review the task intent first, then inspect the diff.",
    taskFiles: [selection.filePath],
    reviewChecks: fileProposal?.reviewChecks ?? []
  };
};

export function ChangeReviewPanel({
  workspace,
  selection,
  onApplyProposal,
  onEditProposal,
  onSaveFile,
  onRunBuildCheck,
  onFixRisk
}: ChangeReviewPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const isEditingRef = useRef(false);
  const diffEditorRef = useRef<MonacoEditor.IStandaloneDiffEditor | null>(null);
  const narrative = getSelectionNarrative(workspace, selection);
  const language = extensionToLanguage(narrative.filePath);
  const proposedCode =
    workspace?.activeFilePath === narrative.filePath && workspace?.activeFileContents
      ? workspace.activeFileContents
      : narrative.proposedCode;
  const hasProposalChanges = proposedCode !== narrative.code;
  const activeProposal = workspace?.proposedChanges.find(
    (proposal) =>
      proposal.filePath === narrative.filePath && proposal.proposedContents === proposedCode
  );
  const fileName = narrative.filePath?.split("/").pop() ?? "No file selected";
  const proposalSource = activeProposal?.source ?? workspace?.proposalState.source;
  const reviewStatus = hasProposalChanges ? "Proposal ready" : "Awaiting generated diff";
  const workingCopyStatus = workspace?.activeFileDirty ? "Working copy has local edits" : "Working copy matches saved file";
  const diffOverview = getDiffOverview(narrative.code, proposedCode);
  const reviewChecks = activeProposal?.reviewChecks ?? narrative.reviewChecks;

  useEffect(() => {
    setIsEditing(false);
  }, [selection?.kind, selection?.id]);

  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  const jumpToChunk = (chunk: DiffChunk) => {
    const modifiedEditor = diffEditorRef.current?.getModifiedEditor();
    if (!modifiedEditor) {
      return;
    }

    modifiedEditor.revealLineInCenter(chunk.focusLine);
    modifiedEditor.setPosition({ lineNumber: chunk.focusLine, column: 1 });
    modifiedEditor.focus();
  };

  return (
    <section className="panel panel--review">
      <div className="review-toolbar">
        <div className="review-toolbar__summary">
          <p className="eyebrow">Code proof</p>
          <h2>{fileName}</h2>
          <p className="muted">{narrative.title}</p>
          <div className="review-surface__meta">
            {proposalSource ? <span className="badge badge--soft">{proposalSource}</span> : null}
            {activeProposal ? (
              <span className={`badge badge--${activeProposal.category === "risk" ? "warning" : "info"}`}>
                {activeProposal.category}
              </span>
            ) : null}
            <span className="badge badge--soft">{reviewStatus}</span>
          </div>
        </div>

        {workspace?.activeFilePath ? (
          <div className="review-toolbar__actions">
            <div className="review-toolbar__actions-primary">
              <button
                type="button"
                onClick={() => onApplyProposal(proposedCode)}
                disabled={!hasProposalChanges}
              >
                Apply proposal
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  onApplyProposal(proposedCode);
                  setIsEditing(true);
                }}
                disabled={!hasProposalChanges}
              >
                Edit working copy
              </button>
            </div>

            <div className="review-toolbar__actions-secondary">
              <button
                type="button"
                className="button-secondary"
                onClick={onRunBuildCheck}
              >
                Build and check
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={!workspace.activeFileDirty}
                onClick={onSaveFile}
              >
                Save current file
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="review-guide">
        <div className="review-guide__lane">
          <span className="review-guide__label">Task detail</span>
          <strong>{narrative.taskLabel}</strong>
          <span className="muted">{narrative.taskSummary}</span>
        </div>
        <div className="review-guide__lane">
          <span className="review-guide__label">Files in scope</span>
          <strong>{narrative.taskFiles.length > 0 ? narrative.taskFiles.length : 1} file(s)</strong>
          <span className="muted">
            {narrative.taskFiles[0] ?? narrative.filePath ?? "No file attached yet"}
          </span>
        </div>
      </div>

      {narrative.issue ? (
        <div className="review-issue-card">
          <div className="review-issue-card__top">
            <div className="review-issue-card__title">
              <span
                className={`badge badge--${
                  narrative.issue.severity === "critical"
                    ? "critical"
                    : narrative.issue.severity === "warning"
                      ? "warning"
                      : "info"
                }`}
              >
                {narrative.issue.lens ?? "issue"}
              </span>
              <strong>{narrative.issue.title}</strong>
            </div>
            <span className="badge badge--soft">{narrative.issue.source}</span>
          </div>
          <p>{narrative.summary}</p>
          {narrative.issue.recommendation ? (
            <p className="muted">{narrative.issue.recommendation}</p>
          ) : null}
          <div className="button-row">
            <button
              type="button"
              onClick={() =>
                onFixRisk?.(narrative.issue?.actionPrompt ?? narrative.summary)
              }
            >
              Fix with AI
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                if (hasProposalChanges) {
                  onApplyProposal(proposedCode);
                }
                setIsEditing(true);
              }}
              disabled={!narrative.filePath}
            >
              Edit manually
            </button>
          </div>
        </div>
      ) : null}

      <div className="review-checks">
        <div className="review-checks__header">
          <span className="review-guide__label">Review checks</span>
          <span className="badge badge--soft">
            {reviewChecks.length > 0 ? `${reviewChecks.length} lenses` : "No checks"}
          </span>
        </div>
        <div className="review-checks__items">
          {reviewChecks.length > 0 ? reviewChecks.map((check) => (
            <div className="review-check" key={check.id}>
              <div className="review-check__top">
                <span className={`badge badge--${check.status === "action" ? "warning" : check.status === "watch" ? "soft" : "info"}`}>
                  {check.lens}
                </span>
                <span className={`badge badge--${check.status === "action" ? "warning" : check.status === "watch" ? "soft" : "info"}`}>
                  {check.status}
                </span>
              </div>
              <strong>{check.title}</strong>
              <p>{check.detail}</p>
            </div>
          )) : (
            <div className="review-overview__empty">
              Select a task or file change to see security, DRY, and validation checks.
            </div>
          )}
        </div>
      </div>

      <details className="review-why" open={selection?.kind === "file"}>
        <summary>Why this change</summary>
        <p className="muted review-why__summary">{narrative.summary}</p>
        <div className="review-narrative">
          {narrative.rationale.map((line) => (
            <div className="review-narrative__item" key={line}>
              <span className="badge badge--soft">why</span>
              <p>{line}</p>
            </div>
          ))}
        </div>
      </details>

      <div className="review-overview">
        <div className="review-overview__stats">
          <div className="review-stat">
            <span className="review-stat__label">Change groups</span>
            <strong>{diffOverview.chunks.length}</strong>
          </div>
          <div className="review-stat">
            <span className="review-stat__label">Added</span>
            <strong>{diffOverview.added}</strong>
          </div>
          <div className="review-stat">
            <span className="review-stat__label">Removed</span>
            <strong>{diffOverview.removed}</strong>
          </div>
          <div className="review-stat">
            <span className="review-stat__label">Working copy</span>
            <strong>{isEditing ? "Editable" : workingCopyStatus}</strong>
          </div>
        </div>

        {diffOverview.chunks.length > 0 ? (
          <div className="review-chunk-map">
            {diffOverview.chunks.map((chunk, index) => (
              <button
                key={chunk.id}
                type="button"
                className={`review-chunk review-chunk--${chunk.kind}`}
                onClick={() => jumpToChunk(chunk)}
              >
                <span className="review-chunk__title">Change {index + 1}</span>
                <span className="review-chunk__meta">
                  lines {chunk.startLine}-{chunk.endLine}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="review-overview__empty">
            No visible file diff yet. Generate or refine a proposal to review a concrete change.
          </div>
        )}
      </div>

      <div className="review-surface">
        <DiffEditor
          height="520px"
          original={narrative.code}
          modified={proposedCode}
          originalLanguage={language}
          modifiedLanguage={language}
          theme="vs-dark"
          options={{
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: 14,
            lineHeight: 22,
            smoothScrolling: true,
            padding: { top: 18 },
            readOnly: !isEditing,
            originalEditable: false,
            renderSideBySide: true,
            scrollBeyondLastLine: false
          }}
          onMount={(diffEditor: MonacoEditor.IStandaloneDiffEditor) => {
            diffEditorRef.current = diffEditor;
            diffEditor.getModifiedEditor().onDidChangeModelContent(() => {
              if (!isEditingRef.current) {
                return;
              }
              onEditProposal(diffEditor.getModifiedEditor().getValue());
            });
          }}
        />
      </div>
    </section>
  );
}
