import path from "node:path";
import type { DotNetSolutionProfile, WorkspaceSummary } from "../ipc/contracts.js";
import { CommandRunner } from "./command-runner.js";

export class SolutionCheckService {
  constructor(private readonly commandRunner = new CommandRunner()) {}

  async run(workspace: WorkspaceSummary, profile: DotNetSolutionProfile): Promise<{
    ok: boolean;
    commands: string[];
    summary: string;
  }> {
    const target =
      workspace.solutionPath ??
      (profile.primarySolutionFile
        ? path.join(workspace.rootPath, profile.primarySolutionFile)
        : profile.projectFiles[0]
          ? path.join(workspace.rootPath, profile.projectFiles[0])
          : workspace.rootPath);

    const buildArgs = ["build", target, "--nologo"];
    const build = await this.commandRunner.run("dotnet", buildArgs, {
      cwd: workspace.rootPath,
      timeoutMs: 60_000
    });

    const commands = [`dotnet ${buildArgs.join(" ")}`];
    if (!build.ok) {
      return {
        ok: false,
        commands: [
          ...commands,
          build.stderr.trim() || build.stdout.trim() || "dotnet build failed"
        ],
        summary: "Build check failed."
      };
    }

    const hasTests = profile.projects.some((project) => project.projectType === "test");
    if (!hasTests) {
      return {
        ok: true,
        commands,
        summary: "Build check passed. No test project detected for follow-up test execution."
      };
    }

    const testArgs = ["test", target, "--no-build", "--nologo"];
    const test = await this.commandRunner.run("dotnet", testArgs, {
      cwd: workspace.rootPath,
      timeoutMs: 60_000
    });
    commands.push(`dotnet ${testArgs.join(" ")}`);
    if (!test.ok) {
      commands.push(test.stderr.trim() || test.stdout.trim() || "dotnet test failed");
      return {
        ok: false,
        commands,
        summary: "Build passed but test check failed."
      };
    }

    return {
      ok: true,
      commands,
      summary: "Build and test checks passed."
    };
  }
}
