import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSnapshot,
  ApproveTaskInput,
  GenerateProposalsInput,
  InspectAzureInput,
  RecentWorkspaceRecord,
  OpenWorkspaceDialogResult,
  OpenWorkspaceInput,
  RunBuildCheckInput,
  RequestAdviceInput
} from "./ipc/contracts.js";

const api = {
  getSnapshot: (): Promise<AppSnapshot> => ipcRenderer.invoke("app:getSnapshot"),
  openWorkspaceDialog: (): Promise<OpenWorkspaceDialogResult> =>
    ipcRenderer.invoke("workspace:openDialog"),
  createWorkspaceDialog: (): Promise<OpenWorkspaceDialogResult> =>
    ipcRenderer.invoke("workspace:createDialog"),
  openWorkspace: (input: OpenWorkspaceInput): Promise<AppSnapshot> =>
    ipcRenderer.invoke("workspace:open", input),
  openWorkspaceWindow: (
    input: OpenWorkspaceInput
  ): Promise<{ ok: boolean }> => ipcRenderer.invoke("launcher:openWorkspaceWindow", input),
  getRecentWorkspaces: (): Promise<RecentWorkspaceRecord[]> =>
    ipcRenderer.invoke("launcher:getRecentWorkspaces"),
  setActiveProject: (workspaceId: string, projectId: string): Promise<AppSnapshot> =>
    ipcRenderer.invoke("workspace:setActiveProject", { workspaceId, projectId }),
  setActiveFile: (workspaceId: string, filePath: string): Promise<AppSnapshot> =>
    ipcRenderer.invoke("workspace:setActiveFile", { workspaceId, filePath }),
  updateActiveFile: (workspaceId: string, contents: string): Promise<AppSnapshot> =>
    ipcRenderer.invoke("workspace:updateActiveFile", { workspaceId, contents }),
  saveActiveFile: (workspaceId: string): Promise<AppSnapshot> =>
    ipcRenderer.invoke("workspace:saveActiveFile", { workspaceId }),
  setActiveWorkspace: (workspaceId: string): Promise<AppSnapshot> =>
    ipcRenderer.invoke("workspace:setActive", workspaceId),
  requestAdvice: (input: RequestAdviceInput): Promise<AppSnapshot> =>
    ipcRenderer.invoke("assistant:requestAdvice", input),
  inspectAzure: (input: InspectAzureInput): Promise<AppSnapshot> =>
    ipcRenderer.invoke("azure:inspect", input),
  approveTask: (input: ApproveTaskInput): Promise<AppSnapshot> =>
    ipcRenderer.invoke("assistant:approveTask", input),
  generateProposals: (input: GenerateProposalsInput): Promise<AppSnapshot> =>
    ipcRenderer.invoke("assistant:generateProposals", input),
  runBuildCheck: (input: RunBuildCheckInput): Promise<AppSnapshot> =>
    ipcRenderer.invoke("workspace:runBuildCheck", input),
  subscribeToSnapshots: (listener: (snapshot: AppSnapshot) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, snapshot: AppSnapshot) =>
      listener(snapshot);
    ipcRenderer.on("app:snapshot", wrapped);
    return () => {
      ipcRenderer.removeListener("app:snapshot", wrapped);
    };
  }
};

const preloadWindow = globalThis as typeof globalThis & {
  addEventListener?: (event: string, listener: () => void) => void;
  document?: {
    documentElement?: {
      setAttribute: (name: string, value: string) => void;
    };
  };
};

preloadWindow.addEventListener?.("DOMContentLoaded", () => {
  preloadWindow.document?.documentElement?.setAttribute(
    "data-aicoder-preload",
    "ready"
  );
});

contextBridge.exposeInMainWorld("aiCoder", api);

export type DesktopApi = typeof api;
