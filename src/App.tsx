import { useEffect, useState } from "react";
import { AssistantPanel } from "./components/AssistantPanel";
import { AzurePanel } from "./components/AzurePanel";
import { TerminalPanel } from "./components/TerminalPanel";
import { SolutionGraphPanel } from "./components/SolutionGraphPanel";
import { ChangeReviewPanel } from "./components/ChangeReviewPanel";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FeatureRequestBar } from "./components/FeatureRequestBar";
import { StoryNavigatorPanel, type StorySelection } from "./components/StoryNavigatorPanel";
import { useWorkflowStep } from "./hooks/useWorkflowStep";
import { desktopApi, isDesktopBridgeAvailable } from "./lib/desktopApi";
import { useAppStore } from "./state/useAppStore";

export function App() {
  const { workspaces, activeWorkspaceId, loadingState, setSnapshot } = useAppStore();
  const [selectedStoryItem, setSelectedStoryItem] = useState<StorySelection | undefined>();

  const [error, setError] = useState<string | undefined>();

  const safeCall = async <T,>(
    label: string,
    fn: () => Promise<T>,
    onSuccess?: (result: T) => void
  ) => {
    try {
      setError(undefined);
      const result = await fn();
      onSuccess?.(result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${label} failed:`, err);
      setError(`${label}: ${message}`);
      return undefined;
    }
  };

  useEffect(() => {
    void safeCall("Load snapshot", () => desktopApi.getSnapshot(), setSnapshot);
    const unsubscribe = desktopApi.subscribeToSnapshots(setSnapshot);
    return unsubscribe;
  }, [setSnapshot]);

  const activeWorkspace = workspaces.find(
    (workspace) => workspace.workspace.id === activeWorkspaceId
  );
  const activeProviderStatus = activeWorkspace?.providerStatuses.find(
    (status) => status.kind === activeWorkspace.workspace.provider
  );
  const isGeneratingPlan = activeWorkspace?.planState.status === "generating";
  const hasGeneratedReviewState = Boolean(
    activeWorkspace?.nextTaskPlan?.steps.length || activeWorkspace?.proposedChanges.length
  );
  const currentWorkflowStep = useWorkflowStep(activeWorkspace);

  useEffect(() => {
    setSelectedStoryItem(undefined);
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!activeWorkspace) {
      return;
    }

    if (selectedStoryItem) {
      const selectionStillExists =
        (selectedStoryItem.kind === "task" &&
          Boolean(activeWorkspace.nextTaskPlan?.steps[selectedStoryItem.index])) ||
        (selectedStoryItem.kind === "file" &&
          activeWorkspace.proposedChanges.some(
            (proposal) => proposal.id === selectedStoryItem.id
          )) ||
        (selectedStoryItem.kind === "risk" &&
          activeWorkspace.suggestions.some(
            (suggestion) => suggestion.id === selectedStoryItem.id
          )) ||
        (selectedStoryItem.kind === "project" &&
          activeWorkspace.profile.projects.some(
            (project) => project.id === selectedStoryItem.projectId
          ));

      if (selectionStillExists) {
        return;
      }
    }

    if (activeWorkspace.nextTaskPlan?.steps.length) {
      setSelectedStoryItem({
        kind: "task",
        id: "task-0",
        index: 0
      });
      return;
    }

    if (activeWorkspace.proposedChanges.length) {
      const proposal = activeWorkspace.proposedChanges[0];
      setSelectedStoryItem({
        kind: "file",
        id: proposal.id,
        filePath: proposal.filePath
      });
    }
  }, [activeWorkspace, selectedStoryItem]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!activeWorkspace) {
        return;
      }

      const isSave = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s";
      if (!isSave || !activeWorkspace.activeFileDirty) {
        return;
      }

      event.preventDefault();
      void safeCall("Save file", () => desktopApi.saveActiveFile(activeWorkspace.workspace.id), setSnapshot);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeWorkspace, setSnapshot]);

  const getTargetFilePath = (): string | undefined => {
    if (selectedStoryItem?.kind === "file") {
      return selectedStoryItem.filePath;
    }
    if (selectedStoryItem?.kind === "risk") {
      return activeWorkspace?.suggestions.find(
        (item) => item.id === selectedStoryItem.id
      )?.relatedFilePath;
    }
    return activeWorkspace?.activeFilePath;
  };

  const applyContentsToFile = async (filePath: string | undefined, contents: string) => {
    if (!activeWorkspace || !filePath) {
      return;
    }

    try {
      let snapshot = activeWorkspace;
      if (snapshot.activeFilePath !== filePath) {
        const next = await desktopApi.setActiveFile(activeWorkspace.workspace.id, filePath);
        setSnapshot(next);
        snapshot = next.workspaces.find(
          (workspace) => workspace.workspace.id === activeWorkspace.workspace.id
        ) ?? snapshot;
      }

      const updated = await desktopApi.updateActiveFile(snapshot.workspace.id, contents);
      setSnapshot(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Apply contents failed:", err);
      setError(`Apply file: ${message}`);
    }
  };

  return (
    <div className="app-shell">
      <main className="main-layout">
        {error ? (
          <section className="bridge-warning" role="alert">
            <strong>Something went wrong</strong>
            <span>{error}</span>
            <button type="button" className="button-secondary" onClick={() => setError(undefined)}>
              Dismiss
            </button>
          </section>
        ) : null}

        {!isDesktopBridgeAvailable ? (
          <section className="bridge-warning">
            <strong>Renderer fallback mode</strong>
            <span>
              The Electron preload bridge is not attached, so you are seeing a safe mock UI
              instead of live desktop data.
            </span>
          </section>
        ) : null}

        {loadingState?.active && !activeWorkspace ? (
          <section className="solution-loading">
            <div className="solution-loading__copy">
              <p className="eyebrow">Opening solution</p>
              <h1>{loadingState.targetName ?? "Loading workspace"}</h1>
              <p className="muted">{loadingState.detail ?? "Preparing the solution view."}</p>
            </div>
            <div
              className="solution-loading__bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={loadingState.progress}
            >
              <div
                className="solution-loading__bar-fill"
                style={{ width: `${loadingState.progress}%` }}
              />
            </div>
            <div className="solution-loading__meta">
              <strong>{loadingState.stage}</strong>
              <span>{loadingState.progress}%</span>
            </div>
          </section>
        ) : null}

        <section className="top-lane">
          <div className="lane-heading lane-heading--top">
            <div className="lane-heading__copy">
              <span className="lane-heading__label">Solution snapshot</span>
              <span className="lane-heading__hint">Where you are working right now</span>
            </div>
            <button
              type="button"
              className="button-secondary top-lane__action"
              onClick={() => {
                void safeCall("Open workspace", async () => {
                  const result = await desktopApi.openWorkspaceDialog();
                  if (result.canceled || !result.rootPath) {
                    return;
                  }
                  await desktopApi.openWorkspaceWindow({
                    rootPath: result.rootPath,
                    solutionPath: result.solutionPath
                  });
                });
              }}
            >
              Open another solution
            </button>
          </div>

          <section className="solution-bar">
            <div className="solution-bar__title">
              <p className="eyebrow">Solution</p>
              <h1>{activeWorkspace?.workspace.name ?? "AI Coder"}</h1>
            </div>
            <div className="solution-bar__meta">
              <span className="badge badge--soft">
                {activeWorkspace?.profile.projectCount ?? 0} projects
              </span>
              <span className="badge badge--soft">
                {activeWorkspace?.workspace.provider ?? "n/a"}
              </span>
              <span className={`badge ${activeProviderStatus?.installed ? "badge--info" : "badge--warning"}`}>
                {activeProviderStatus?.installed ? "assistant ready" : "assistant setup"}
              </span>
              {activeWorkspace?.profile.detectedStacks.slice(0, 4).map((stack) => (
                <span className="badge" key={stack.kind}>
                  {stack.kind}
                </span>
              ))}
            </div>
            <code className="solution-bar__path">
              {activeWorkspace?.workspace.solutionPath ??
                activeWorkspace?.workspace.rootPath ??
                "No workspace selected"}
            </code>
          </section>

          <section className="workflow-strip">
            <div className={`workflow-step ${currentWorkflowStep === 1 ? "workflow-step--active" : ""}`}>
              <span className="workflow-step__index">1</span>
              <div>
                <strong>Describe the feature</strong>
                <p>Tell the assistant what you want to build or change.</p>
              </div>
            </div>
            <div className={`workflow-step ${currentWorkflowStep === 2 ? "workflow-step--active" : ""}`}>
              <span className="workflow-step__index">2</span>
              <div>
                <strong>Generate the plan</strong>
                <p>Review the implementation steps and affected files.</p>
              </div>
            </div>
            <div className={`workflow-step ${currentWorkflowStep === 3 ? "workflow-step--active" : ""}`}>
              <span className="workflow-step__index">3</span>
              <div>
                <strong>Review the code</strong>
                <p>Inspect diffs, checks, and rationale.</p>
              </div>
            </div>
            <div className={`workflow-step ${currentWorkflowStep === 4 ? "workflow-step--active" : ""}`}>
              <span className="workflow-step__index">4</span>
              <div>
                <strong>Apply and validate</strong>
                <p>Save the result, then build and check.</p>
              </div>
            </div>
          </section>

          <FeatureRequestBar
            isGeneratingPlan={isGeneratingPlan}
            generatingSummary={
              activeWorkspace?.planState.summary ?? activeWorkspace?.sessionState.summary
            }
            onGeneratePlan={(prompt) => {
              if (!activeWorkspace) {
                return;
              }
              void safeCall("Generate plan", () =>
                desktopApi.requestAdvice({
                  workspaceId: activeWorkspace.workspace.id,
                  prompt
                }), setSnapshot);
            }}
          />
        </section>

        {hasGeneratedReviewState ? (
          <>
            <section className="studio-frame">
              <div className="lane lane--story">
                <ErrorBoundary label="StoryNavigator">
                <StoryNavigatorPanel
                  workspace={activeWorkspace}
                  onApplyAndValidate={() => {
                    if (!activeWorkspace) {
                      return;
                    }
                    void safeCall("Apply and validate", () =>
                      desktopApi.applyAndValidate({
                        workspaceId: activeWorkspace.workspace.id
                      }), setSnapshot);
                  }}
                  onApprovePlan={() => {
                    if (!activeWorkspace?.nextTaskPlan) {
                      return;
                    }
                    void safeCall("Approve plan", () =>
                      desktopApi.approveTask({
                        workspaceId: activeWorkspace.workspace.id,
                        taskPlanId: activeWorkspace.nextTaskPlan!.id
                      }), setSnapshot);
                  }}
                  onSelectProject={(projectId) => {
                    if (!activeWorkspace) {
                      return;
                    }
                    void safeCall("Select project", () =>
                      desktopApi.setActiveProject(activeWorkspace.workspace.id, projectId), setSnapshot);
                  }}
                  selectedItem={selectedStoryItem}
                  onSelectItem={setSelectedStoryItem}
                />
                </ErrorBoundary>
              </div>

              <div className="lane lane--review">
                <div className="review-stack">
                  <ErrorBoundary label="ChangeReview">
                  <ChangeReviewPanel
                    workspace={activeWorkspace}
                    selection={selectedStoryItem}
                    onApplyProposal={(contents) => {
                      void applyContentsToFile(getTargetFilePath(), contents);
                    }}
                    onEditProposal={(contents) => {
                      void applyContentsToFile(getTargetFilePath(), contents);
                    }}
                    onSaveFile={() => {
                      if (!activeWorkspace) {
                        return;
                      }
                      void safeCall("Save file", () =>
                        desktopApi.saveActiveFile(activeWorkspace.workspace.id), setSnapshot);
                    }}
                    onRunBuildCheck={() => {
                      if (!activeWorkspace) {
                        return;
                      }
                      void safeCall("Build check", () =>
                        desktopApi.runBuildCheck({
                          workspaceId: activeWorkspace.workspace.id
                        }), setSnapshot);
                    }}
                    onFixRisk={(prompt) => {
                      if (!activeWorkspace) {
                        return;
                      }
                      const issueId =
                        selectedStoryItem?.kind === "risk" ? selectedStoryItem.id : undefined;
                      if (!issueId) {
                        return;
                      }
                      const workspaceId = activeWorkspace.workspace.id;

                      void safeCall("Fix risk", async () => {
                        let snapshot = await desktopApi.updateSuggestionStatus({
                          workspaceId,
                          suggestionId: issueId,
                          reviewStatus: "fixing",
                          resolutionNote: "The AI is preparing a revised fix for this issue."
                        });
                        setSnapshot(snapshot);

                        snapshot = await desktopApi.generateProposals({
                          workspaceId,
                          prompt
                        });
                        setSnapshot(snapshot);

                        snapshot = await desktopApi.updateSuggestionStatus({
                          workspaceId,
                          suggestionId: issueId,
                          reviewStatus: "fix-proposed",
                          resolutionNote: "A revised fix is ready for review."
                        });
                        return snapshot;
                      }, setSnapshot);
                    }}
                    onResolveRisk={(note) => {
                      if (!activeWorkspace) {
                        return;
                      }
                      const issueId =
                        selectedStoryItem?.kind === "risk" ? selectedStoryItem.id : undefined;
                      if (!issueId) {
                        return;
                      }

                      void safeCall("Resolve risk", () =>
                        desktopApi.updateSuggestionStatus({
                          workspaceId: activeWorkspace.workspace.id,
                          suggestionId: issueId,
                          reviewStatus: "resolved",
                          resolutionNote: note
                        }), setSnapshot);
                    }}
                  />
                  </ErrorBoundary>
                  <ErrorBoundary label="Assistant">
                  <AssistantPanel
                    workspace={activeWorkspace}
                    onFixValidationIssue={() => {
                      if (!activeWorkspace) {
                        return;
                      }
                      const prompt = [
                        "Fix the current validation issue for this approved implementation.",
                        activeWorkspace.validationResult.summary ?? "",
                        ...activeWorkspace.validationResult.commands
                      ]
                        .filter(Boolean)
                        .join("\n\n");

                      void safeCall("Fix validation", () =>
                        desktopApi.requestAdvice({
                          workspaceId: activeWorkspace.workspace.id,
                          prompt
                        }), setSnapshot);
                    }}
                  />
                  </ErrorBoundary>
                </div>
              </div>
            </section>

            <details className="support-drawer">
              <summary>More context: solution graph, Azure, and execution log</summary>
              <section className="support-dock">
                <SolutionGraphPanel workspace={activeWorkspace} />
                <AzurePanel
                  workspace={activeWorkspace}
                  onInspectAzure={() => {
                    if (!activeWorkspace) {
                      return;
                    }
                    void safeCall("Inspect Azure", () =>
                      desktopApi.inspectAzure({
                        workspaceId: activeWorkspace.workspace.id
                      }), setSnapshot);
                  }}
                />
                <TerminalPanel workspace={activeWorkspace} />
              </section>
            </details>
          </>
        ) : (
          <section className="start-state">
            <div className="start-state__copy">
              <p className="eyebrow">Ready to plan</p>
              <h2>Describe the feature you want to build</h2>
              <p className="muted">
                Start with a clear request like adding login, reviewing a Blazor flow, or
                improving an API endpoint. The implementation plan and code review will appear
                here after you generate them.
              </p>
            </div>
            <div className="start-state__grid">
              <div className="start-state__card">
                <span className="summary-label">Try asking for</span>
                <strong>Implement login for the Blazor web app</strong>
                <p>Generate the implementation plan first, then review each code change.</p>
              </div>
              <div className="start-state__card">
                <span className="summary-label">Solution context</span>
                <strong>{activeWorkspace?.profile.projectCount ?? 0} projects detected</strong>
                <p>
                  {activeWorkspace?.workspace.name ?? "This solution"} is ready for feature
                  planning and review.
                </p>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
