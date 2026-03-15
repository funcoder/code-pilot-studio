import { app, BrowserWindow, dialog, ipcMain } from "electron";
import type { OpenDialogOptions } from "electron";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { OpenWorkspaceInput } from "./ipc/contracts.js";
import { AppController } from "./core/app-controller.js";
import { RecentWorkspacesService } from "./services/recent-workspaces-service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let launcherWindow: BrowserWindow | null = null;
const solutionControllers = new Map<number, AppController>();
const recentWorkspaces = new RecentWorkspacesService(
  path.join(app.getPath("userData"), "recent-workspaces.json")
);

const loadWindow = async (window: BrowserWindow, view: "launcher" | "solution") => {
  const rendererUrl = process.env.VITE_DEV_SERVER_URL;
  const target = view === "launcher" ? "?view=launcher" : "?view=solution";

  if (rendererUrl) {
    await window.loadURL(`${rendererUrl}${target}`);
    return;
  }

  await window.loadFile(path.resolve(__dirname, "../dist/index.html"), {
    search: target
  });
};

const createLauncherWindow = async (): Promise<BrowserWindow> => {
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.focus();
    return launcherWindow;
  }

  launcherWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#09111a",
    title: "AI Coder Launcher",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  launcherWindow.on("closed", () => {
    launcherWindow = null;
  });

  await loadWindow(launcherWindow, "launcher");
  return launcherWindow;
};

const createSolutionWindow = async (input: OpenWorkspaceInput): Promise<BrowserWindow> => {
  const window = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#09111a",
    title: input.solutionPath ? path.basename(input.solutionPath) : path.basename(input.rootPath),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const controller = new AppController((snapshot) => {
    if (!window.isDestroyed()) {
      window.webContents.send("app:snapshot", snapshot);
    }
  });

  solutionControllers.set(window.id, controller);
  window.on("closed", () => {
    solutionControllers.delete(window.id);
  });

  await loadWindow(window, "solution");
  void controller.openWorkspace(input);
  void recentWorkspaces.remember(input);
  return window;
};

const getSolutionController = (window: BrowserWindow | null): AppController | undefined =>
  window ? solutionControllers.get(window.id) : undefined;

const showWorkspaceDialog = async (focusedWindow: BrowserWindow | null) => {
  const options: OpenDialogOptions = {
    properties: ["openDirectory", "openFile"],
    filters: [{ name: ".NET Solution", extensions: ["sln"] }],
    title: "Open workspace or solution"
  };
  const result = focusedWindow
    ? await dialog.showOpenDialog(focusedWindow, options)
    : await dialog.showOpenDialog(options);

  const selectedPath = result.filePaths[0];
  const isSolutionFile = selectedPath?.toLowerCase().endsWith(".sln");

  return {
    canceled: result.canceled,
    rootPath: isSolutionFile ? path.dirname(selectedPath) : selectedPath,
    solutionPath: isSolutionFile ? selectedPath : undefined
  };
};

const createNewSolution = async (focusedWindow: BrowserWindow | null) => {
  const result = focusedWindow
    ? await dialog.showSaveDialog(focusedWindow, {
        title: "Create new solution workspace",
        buttonLabel: "Create workspace",
        properties: ["createDirectory"],
        nameFieldLabel: "Solution folder"
      })
    : await dialog.showSaveDialog({
        title: "Create new solution workspace",
        buttonLabel: "Create workspace",
        properties: ["createDirectory"],
        nameFieldLabel: "Solution folder"
      });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  await mkdir(result.filePath, { recursive: true });
  return {
    canceled: false,
    rootPath: result.filePath
  };
};

ipcMain.handle("app:getSnapshot", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const controller = getSolutionController(window);
  return controller?.getSnapshot() ?? { workspaces: [], activeWorkspaceId: "", loadingState: undefined };
});
ipcMain.handle("workspace:openDialog", async (event) =>
  showWorkspaceDialog(BrowserWindow.fromWebContents(event.sender))
);
ipcMain.handle("workspace:createDialog", async (event) =>
  createNewSolution(BrowserWindow.fromWebContents(event.sender))
);
ipcMain.handle("launcher:getRecentWorkspaces", () => recentWorkspaces.list());
ipcMain.handle("launcher:openWorkspaceWindow", async (_event, input: OpenWorkspaceInput) => {
  await createSolutionWindow(input);
  return { ok: true };
});
ipcMain.handle("workspace:open", async (_event, input) => {
  const window = await createSolutionWindow(input);
  return getSolutionController(window)?.getSnapshot() ?? { workspaces: [], activeWorkspaceId: "", loadingState: undefined };
});
ipcMain.handle("workspace:setActiveProject", (event, input) =>
  getSolutionController(BrowserWindow.fromWebContents(event.sender))?.setActiveProject(
    input.workspaceId,
    input.projectId
  )
);
ipcMain.handle("workspace:setActiveFile", (event, input) =>
  getSolutionController(BrowserWindow.fromWebContents(event.sender))?.setActiveFile(
    input.workspaceId,
    input.filePath
  )
);
ipcMain.handle("workspace:updateActiveFile", (event, input) =>
  getSolutionController(BrowserWindow.fromWebContents(event.sender))?.updateActiveFile(
    input.workspaceId,
    input.contents
  )
);
ipcMain.handle("workspace:saveActiveFile", (event, input) =>
  getSolutionController(BrowserWindow.fromWebContents(event.sender))?.saveActiveFile(
    input.workspaceId
  )
);
ipcMain.handle("workspace:runBuildCheck", (event, input) =>
  getSolutionController(BrowserWindow.fromWebContents(event.sender))?.runBuildCheck(
    input.workspaceId
  )
);
ipcMain.handle("workspace:setActive", (event, workspaceId: string) =>
  getSolutionController(BrowserWindow.fromWebContents(event.sender))?.setActiveWorkspace(
    workspaceId
  )
);
ipcMain.handle("assistant:requestAdvice", (event, input) =>
  getSolutionController(BrowserWindow.fromWebContents(event.sender))?.requestAdvice(input)
);
ipcMain.handle("assistant:approveTask", (event, input) =>
  getSolutionController(BrowserWindow.fromWebContents(event.sender))?.approveTask(input)
);
ipcMain.handle("assistant:generateProposals", (event, input) =>
  getSolutionController(BrowserWindow.fromWebContents(event.sender))?.generateProposals(input)
);
ipcMain.handle("azure:inspect", (event, input) =>
  getSolutionController(BrowserWindow.fromWebContents(event.sender))?.inspectAzure(input)
);

app.whenReady().then(createLauncherWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createLauncherWindow();
  }
});
