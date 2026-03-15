import { stat } from "node:fs/promises";
import path from "node:path";
import type { OpenWorkspaceInput, WorkspaceSummary } from "../ipc/contracts.js";

export class WorkspaceService {
  async createWorkspace(input: OpenWorkspaceInput, count: number): Promise<WorkspaceSummary> {
    const info = await stat(input.rootPath);
    if (!info.isDirectory()) {
      throw new Error(`${input.rootPath} is not a directory`);
    }

    const name = input.solutionPath
      ? path.basename(input.solutionPath, path.extname(input.solutionPath))
      : path.basename(input.rootPath) || `workspace-${count + 1}`;
    return {
      id: `workspace-${count + 1}`,
      name,
      rootPath: input.rootPath,
      solutionPath: input.solutionPath,
      provider: count % 2 === 0 ? "codex" : "claude-code"
    };
  }
}
