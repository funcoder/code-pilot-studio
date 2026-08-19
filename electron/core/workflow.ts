import type { WorkspaceSnapshot } from "../ipc/contracts.js";

export type WorkflowPhase =
  | "describe"
  | "planning"
  | "review-plan"
  | "implementing"
  | "review-code"
  | "validating"
  | "validated";

const VALID_TRANSITIONS: Record<WorkflowPhase, WorkflowPhase[]> = {
  "describe": ["planning"],
  "planning": ["review-plan", "describe"],
  "review-plan": ["implementing", "describe"],
  "implementing": ["review-code", "review-plan", "describe"],
  "review-code": ["validating", "implementing", "describe"],
  "validating": ["validated", "review-code"],
  "validated": ["describe", "implementing", "review-code"]
};

export const WORKFLOW_STEPS: { phase: WorkflowPhase; step: number; label: string }[] = [
  { phase: "describe", step: 1, label: "Describe the feature" },
  { phase: "planning", step: 2, label: "Generate the plan" },
  { phase: "review-plan", step: 2, label: "Generate the plan" },
  { phase: "implementing", step: 3, label: "Review the code" },
  { phase: "review-code", step: 3, label: "Review the code" },
  { phase: "validating", step: 4, label: "Apply and validate" },
  { phase: "validated", step: 4, label: "Apply and validate" }
];

export const deriveWorkflowPhase = (workspace: WorkspaceSnapshot): WorkflowPhase => {
  const { planState, proposalState, validationResult, activeFileDirty } = workspace;

  if (
    validationResult.status === "running"
  ) {
    return "validating";
  }

  if (
    validationResult.status === "passed" ||
    validationResult.status === "failed" ||
    activeFileDirty
  ) {
    return "validated";
  }

  if (proposalState.status === "generating") {
    return "implementing";
  }

  if (workspace.proposedChanges.length > 0) {
    return "review-code";
  }

  if (planState.status === "generating") {
    return "planning";
  }

  if (
    planState.status === "ready" ||
    planState.status === "fallback" ||
    Boolean(workspace.nextTaskPlan?.steps.length)
  ) {
    return "review-plan";
  }

  return "describe";
};

export const getWorkflowStep = (workspace: WorkspaceSnapshot): number => {
  const phase = deriveWorkflowPhase(workspace);
  return WORKFLOW_STEPS.find((item) => item.phase === phase)?.step ?? 1;
};

export const canTransition = (from: WorkflowPhase, to: WorkflowPhase): boolean =>
  VALID_TRANSITIONS[from]?.includes(to) ?? false;

export const assertTransition = (from: WorkflowPhase, to: WorkflowPhase): void => {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid workflow transition: "${from}" -> "${to}". Valid targets: ${VALID_TRANSITIONS[from]?.join(", ") ?? "none"}`
    );
  }
};
