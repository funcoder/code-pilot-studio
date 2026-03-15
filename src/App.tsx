import { useEffect, useState } from "react";
import { AssistantPanel } from "./components/AssistantPanel";
import { AzurePanel } from "./components/AzurePanel";
import { TerminalPanel } from "./components/TerminalPanel";
import { SolutionGraphPanel } from "./components/SolutionGraphPanel";
import { ChangeReviewPanel } from "./components/ChangeReviewPanel";
import { FeatureRequestBar } from "./components/FeatureRequestBar";
import { StoryNavigatorPanel, type StorySelection } from "./components/StoryNavigatorPanel";
import { desktopApi, isDesktopBridgeAvailable } from "./lib/desktopApi";
import { useAppStore } from "./state/useAppStore";

export function App() {
  const { workspaces, activeWorkspaceId, loadingState, setSnapshot } = useAppStore();
  const [selectedStoryItem, setSelectedStoryItem] = useState<StorySelection | undefined>();

  useEffect(() => {
    void desktopApi.getSnapshot().then(setSnapshot);
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
  const currentWorkflowStep = (() => {
    if (!activeWorkspace) {
      return 1;
    }
    if (
      activeWorkspace.validationResult.status === "running" ||
      activeWorkspace.validationResult.status === "passed" ||
      activeWorkspace.validationResult.status === "failed" ||
      activeWorkspace.activeFileDirty
    ) {
      return 4;
    }
    if (
      activeWorkspace.proposalState.status === "generating" ||
      activeWorkspace.proposedChanges.length > 0
    ) {
      return 3;
    }
    if (
      activeWorkspace.planState.status === "generating" ||
      activeWorkspace.planState.status === "ready" ||
      activeWorkspace.planState.status === "fallback" ||
      Boolean(activeWorkspace.nextTaskPlan?.steps.length)
    ) {
      return 2;
    }
    return 1;
  })();

  useEffect(() => {
    setSelectedStoryItem(undefined);
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!activeWorkspace) {
      return;
    }

    if (selectedStoryItem) {
      return;
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
      void desktopApi.saveActiveFile(activeWorkspace.workspace.id).then(setSnapshot);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeWorkspace, setSnapshot]);

  const applyContentsToFile = async (filePath: string | undefined, contents: string) => {
    if (!activeWorkspace || !filePath) {
      return;
    }

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
  };

  return (
    <div className="app-shell">
      <main className="main-layout">
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
                void desktopApi.openWorkspaceDialog().then((result) => {
                  if (result.canceled || !result.rootPath) {
                    return;
                  }

                  void desktopApi.openWorkspaceWindow({
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
              void desktopApi
                .requestAdvice({
                  workspaceId: activeWorkspace.workspace.id,
                  prompt
                })
                .then(setSnapshot);
            }}
          />
        </section>

        {hasGeneratedReviewState ? (
          <>
            <section className="studio-frame">
              <div className="lane lane--story">
                <StoryNavigatorPanel
                  workspace={activeWorkspace}
                  onApplyAndValidate={() => {
                    if (!activeWorkspace) {
                      return;
                    }
                    void desktopApi
                      .applyAndValidate({
                        workspaceId: activeWorkspace.workspace.id
                      })
                      .then(setSnapshot);
                  }}
                  onApprovePlan={() => {
                    if (!activeWorkspace?.nextTaskPlan) {
                      return;
                    }
                    void desktopApi
                      .approveTask({
                        workspaceId: activeWorkspace.workspace.id,
                        taskPlanId: activeWorkspace.nextTaskPlan.id
                      })
                      .then(setSnapshot);
                  }}
                  onSelectProject={(projectId) => {
                    if (!activeWorkspace) {
                      return;
                    }
                    void desktopApi
                      .setActiveProject(activeWorkspace.workspace.id, projectId)
                      .then(setSnapshot);
                  }}
                  selectedItem={selectedStoryItem}
                  onSelectItem={setSelectedStoryItem}
                />
              </div>

              <div className="lane lane--review">
                <div className="review-stack">
                  <ChangeReviewPanel
                    workspace={activeWorkspace}
                    selection={selectedStoryItem}
                    onApplyProposal={(contents) => {
                      const targetFilePath =
                        selectedStoryItem?.kind === "file"
                          ? selectedStoryItem.filePath
                          : selectedStoryItem?.kind === "risk"
                            ? activeWorkspace?.suggestions.find(
                                (item) => item.id === selectedStoryItem.id
                              )?.relatedFilePath
                            : activeWorkspace?.activeFilePath;
                      void applyContentsToFile(targetFilePath, contents);
                    }}
                    onEditProposal={(contents) => {
                      const targetFilePath =
                        selectedStoryItem?.kind === "file"
                          ? selectedStoryItem.filePath
                          : selectedStoryItem?.kind === "risk"
                            ? activeWorkspace?.suggestions.find(
                                (item) => item.id === selectedStoryItem.id
                              )?.relatedFilePath
                            : activeWorkspace?.activeFilePath;
                      void applyContentsToFile(targetFilePath, contents);
                    }}
                    onSaveFile={() => {
                      if (!activeWorkspace) {
                        return;
                      }
                      void desktopApi
                        .saveActiveFile(activeWorkspace.workspace.id)
                        .then(setSnapshot);
                    }}
                    onRunBuildCheck={() => {
                      if (!activeWorkspace) {
                        return;
                      }
                      void desktopApi
                        .runBuildCheck({
                          workspaceId: activeWorkspace.workspace.id
                        })
                        .then(setSnapshot);
                    }}
                    onFixRisk={(prompt) => {
                      if (!activeWorkspace) {
                        return;
                      }

                      void desktopApi
                        .requestAdvice({
                          workspaceId: activeWorkspace.workspace.id,
                          prompt
                        })
                        .then(setSnapshot);
                    }}
                  />
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

                      void desktopApi
                        .requestAdvice({
                          workspaceId: activeWorkspace.workspace.id,
                          prompt
                        })
                        .then(setSnapshot);
                    }}
                  />
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
                    void desktopApi
                      .inspectAzure({
                        workspaceId: activeWorkspace.workspace.id
                      })
                      .then(setSnapshot);
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
