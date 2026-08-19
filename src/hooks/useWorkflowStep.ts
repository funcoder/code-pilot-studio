import { useMemo } from "react";
import type { WorkspaceSnapshot } from "../../electron/ipc/contracts";
import { deriveWorkflowPhase, getWorkflowStep, type WorkflowPhase } from "../../electron/core/workflow";

export { type WorkflowPhase };

export const useWorkflowStep = (workspace?: WorkspaceSnapshot): number =>
  useMemo(() => {
    if (!workspace) {
      return 1;
    }
    return getWorkflowStep(workspace);
  }, [workspace]);

export const useWorkflowPhase = (workspace?: WorkspaceSnapshot): WorkflowPhase =>
  useMemo(() => {
    if (!workspace) {
      return "describe";
    }
    return deriveWorkflowPhase(workspace);
  }, [workspace]);
