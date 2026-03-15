import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type {
  DotNetSolutionProfile,
  SolutionProject,
  StackDetection,
  WorkspaceSummary
} from "../ipc/contracts.js";
import { defaultDotNetProfile } from "../core/sample-data.js";

const SKIP_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "bin",
  "dist",
  "dist-electron",
  "node_modules",
  "obj"
]);

interface ScanResult {
  files: string[];
  projectFiles: string[];
  solutionFiles: string[];
  bicepFiles: string[];
}

interface ProjectDescriptor {
  relativePath: string;
  name: string;
  targetFrameworks: string[];
  projectType: SolutionProject["projectType"];
  references: string[];
  startupFiles: string[];
  visibleFiles: string[];
}

const uniq = (values: string[]): string[] => Array.from(new Set(values)).sort();

const extractTargetFrameworks = (contents: string): string[] => {
  const frameworks: string[] = [];
  const matches = [
    ...(contents.match(/<TargetFramework>([^<]+)<\/TargetFramework>/g) ?? []),
    ...(contents.match(/<TargetFrameworks>([^<]+)<\/TargetFrameworks>/g) ?? [])
  ];

  for (const match of matches) {
    const value = match.replace(/<\/?TargetFrameworks?>/g, "");
    frameworks.push(...value.split(";").map((item) => item.trim()).filter(Boolean));
  }

  return uniq(frameworks);
};

const extractProjectReferences = (contents: string): string[] =>
  uniq(
    Array.from(contents.matchAll(/<ProjectReference Include="([^"]+)"/g)).map(
      (match) => match[1]
    )
  );

const relative = (rootPath: string, filePath: string) =>
  path.relative(rootPath, filePath) || path.basename(filePath);

const classifyProject = (
  contents: string,
  relativePath: string
): SolutionProject["projectType"] => {
  const lowerPath = relativePath.toLowerCase();
  if (contents.includes("<UseMaui>true</UseMaui>")) {
    return "maui";
  }
  if (contents.includes("Microsoft.NET.Sdk.Web")) {
    if (
      lowerPath.includes("blazor") ||
      contents.includes("Microsoft.AspNetCore.Components")
    ) {
      return "blazor";
    }
    return "web";
  }
  if (lowerPath.includes("test") || contents.includes("Microsoft.NET.Test.Sdk")) {
    return "test";
  }
  if (contents.includes("Microsoft.NET.Sdk.Worker")) {
    return "worker";
  }
  if (contents.includes("Microsoft.NET.Sdk")) {
    return "library";
  }
  return "unknown";
};

const parseSolutionProjects = (
  solutionContents: string
): Array<{ name: string; relativePath: string }> =>
  Array.from(
    solutionContents.matchAll(
      /Project\("\{[^"]+"\}\) = "([^"]+)", "([^"]+\.(?:csproj|fsproj|vbproj))", "\{[^"]+"\}/g
    )
  ).map((match) => ({
    name: match[1],
    relativePath: match[2].replace(/\\/g, "/")
  }));

const filePriority = (file: string): number => {
  const lower = file.toLowerCase();
  if (lower.endsWith("program.cs")) {
    return 0;
  }
  if (lower.endsWith("startup.cs")) {
    return 1;
  }
  if (lower.endsWith("app.razor") || lower.endsWith("app.xaml")) {
    return 2;
  }
  if (lower.includes("/properties/launchsettings.json")) {
    return 3;
  }
  if (lower.endsWith("appsettings.json")) {
    return 4;
  }
  if (lower.endsWith("appsettings.development.json")) {
    return 5;
  }
  if (lower.endsWith(".cs")) {
    return 10;
  }
  if (lower.endsWith(".razor")) {
    return 11;
  }
  if (lower.endsWith(".xaml")) {
    return 12;
  }
  if (lower.endsWith(".json")) {
    return 13;
  }
  return 20;
};

const pickVisibleFiles = (files: string[]): string[] =>
  files
    .filter((file) => {
      const lower = file.toLowerCase();
      return (
        lower.endsWith(".cs") ||
        lower.endsWith(".razor") ||
        lower.endsWith(".json") ||
        lower.endsWith(".xaml") ||
        lower.endsWith(".http")
      );
    })
    .filter((file) => !file.toLowerCase().includes("/obj/"))
    .filter((file) => !file.toLowerCase().includes("/bin/"))
    .sort((left, right) => {
      const priority = filePriority(left) - filePriority(right);
      if (priority !== 0) {
        return priority;
      }
      return left.localeCompare(right);
    })
    .slice(0, 40);

const pickStartupFiles = (files: string[]): string[] =>
  files.filter((file) => {
    const name = path.basename(file).toLowerCase();
    return (
      name === "program.cs" ||
      name === "startup.cs" ||
      name === "app.razor" ||
      name === "app.xaml" ||
      name === "mauiProgram.cs".toLowerCase()
    );
  });

export class DotNetExpertiseService {
  async detectSolutionProfile(workspace: WorkspaceSummary): Promise<DotNetSolutionProfile> {
    const scan = await this.scanWorkspace(workspace.rootPath);
    const projectMap = new Map<string, ProjectDescriptor>();

    for (const filePath of scan.projectFiles) {
      const contents = await readFile(filePath, "utf8");
      const relativePath = relative(workspace.rootPath, filePath).replace(/\\/g, "/");
      const projectDir = path.dirname(filePath);
      const projectRelativeDir = path.dirname(relativePath);
      const projectFiles = scan.files
        .filter((candidate) => candidate.startsWith(`${projectDir}${path.sep}`))
        .map((candidate) => relative(workspace.rootPath, candidate).replace(/\\/g, "/"));
      projectMap.set(relativePath, {
        relativePath,
        name: path.basename(filePath, path.extname(filePath)),
        targetFrameworks: extractTargetFrameworks(contents),
        projectType: classifyProject(contents, relativePath),
        references: extractProjectReferences(contents).map((value) =>
          path
            .normalize(path.join(path.dirname(relativePath), value))
            .replace(/\\/g, "/")
        ),
        startupFiles: pickStartupFiles(projectFiles).map((file) =>
          file.startsWith(projectRelativeDir) ? file : `${projectRelativeDir}/${file}`
        ),
        visibleFiles: pickVisibleFiles(projectFiles).map((file) =>
          file.startsWith(projectRelativeDir) ? file : `${projectRelativeDir}/${file}`
        )
      });
    }

    const solutionFiles = scan.solutionFiles.map((filePath) =>
      relative(workspace.rootPath, filePath)
    );
    const primarySolutionFile = solutionFiles[0];
    const solutionEntries = primarySolutionFile
      ? parseSolutionProjects(
          await readFile(path.join(workspace.rootPath, primarySolutionFile), "utf8")
        )
      : [];

    const projects: SolutionProject[] =
      solutionEntries.length > 0
        ? solutionEntries
            .map((entry) => {
              const descriptor = projectMap.get(entry.relativePath);
              if (!descriptor) {
                return undefined;
              }

              return {
                id: descriptor.relativePath,
                name: entry.name,
                relativePath: descriptor.relativePath,
                targetFrameworks: descriptor.targetFrameworks,
                projectType: descriptor.projectType,
                references: descriptor.references,
                startupFiles: descriptor.startupFiles,
                visibleFiles: descriptor.visibleFiles
              } satisfies SolutionProject;
            })
            .filter((project): project is SolutionProject => Boolean(project))
        : Array.from(projectMap.values()).map((descriptor) => ({
            id: descriptor.relativePath,
            name: descriptor.name,
            relativePath: descriptor.relativePath,
            targetFrameworks: descriptor.targetFrameworks,
            projectType: descriptor.projectType,
            references: descriptor.references,
            startupFiles: descriptor.startupFiles,
            visibleFiles: descriptor.visibleFiles
          }));

    const projectFiles = scan.projectFiles.map((filePath) =>
      relative(workspace.rootPath, filePath)
    );
    const bicepFiles = scan.bicepFiles.map((filePath) =>
      relative(workspace.rootPath, filePath)
    );
    const targetFrameworks = uniq(projects.flatMap((project) => project.targetFrameworks));
    const lowerFileSet = scan.files.map((filePath) =>
      relative(workspace.rootPath, filePath).toLowerCase()
    );

    const stacks: StackDetection[] = [];
    const appModels: string[] = [];

    if (projects.length > 0 || solutionFiles.length > 0) {
      stacks.push({
        kind: "dotnet",
        confidence: 0.99,
        evidence: [...solutionFiles.slice(0, 1), ...projectFiles.slice(0, 2)]
      });
    }

    const webProjects = projects.filter((project) => project.projectType === "web");
    if (webProjects.length > 0) {
      stacks.push({
        kind: "aspnet-core",
        confidence: 0.95,
        evidence: webProjects.slice(0, 3).map((project) => project.relativePath)
      });
      appModels.push("aspnet-core");
    }

    const blazorProjects = projects.filter((project) => project.projectType === "blazor");
    if (blazorProjects.length > 0 || lowerFileSet.some((file) => file.endsWith(".razor"))) {
      stacks.push({
        kind: "blazor",
        confidence: 0.91,
        evidence: blazorProjects.slice(0, 3).map((project) => project.relativePath)
      });
      appModels.push("blazor");
    }

    if (
      scan.files.some((filePath) => filePath.endsWith(".cs")) &&
      (await this.findContentMatch(scan.files, ["AddSignalR", "MapHub(", "Hub<", ": Hub"]))
    ) {
      stacks.push({
        kind: "signalr",
        confidence: 0.86,
        evidence: ["SignalR APIs detected in source"]
      });
      appModels.push("signalr");
    }

    const mauiProjects = projects.filter((project) => project.projectType === "maui");
    if (mauiProjects.length > 0) {
      stacks.push({
        kind: "maui",
        confidence: 0.92,
        evidence: mauiProjects.slice(0, 3).map((project) => project.relativePath)
      });
      appModels.push("maui");
    }

    if (bicepFiles.length > 0) {
      stacks.push({
        kind: "bicep",
        confidence: 0.94,
        evidence: bicepFiles.slice(0, 3)
      });
    }

    if (
      bicepFiles.length > 0 ||
      lowerFileSet.some((file) => file.includes("azure")) ||
      lowerFileSet.some((file) => file === "azure.yaml" || file === "azure.yml")
    ) {
      stacks.push({
        kind: "azure",
        confidence: bicepFiles.length > 0 ? 0.85 : 0.65,
        evidence:
          bicepFiles.slice(0, 2).length > 0
            ? bicepFiles.slice(0, 2)
            : ["Azure-related files detected"]
      });
    }

    const usesPreviewSdk = targetFrameworks.some((framework) => framework.startsWith("net11"));

    return {
      ...defaultDotNetProfile,
      targetFrameworks:
        targetFrameworks.length > 0
          ? targetFrameworks
          : defaultDotNetProfile.targetFrameworks,
      usesPreviewSdk,
      appModels: uniq(appModels),
      detectedStacks: stacks.length > 0 ? stacks : defaultDotNetProfile.detectedStacks,
      solutionFiles,
      projectFiles,
      bicepFiles,
      projectCount: projectFiles.length,
      primarySolutionFile,
      projects
    };
  }

  createReviewPrompts(workspace: WorkspaceSummary, profile: DotNetSolutionProfile): string[] {
    const workspaceName = path.basename(workspace.rootPath);
    const primary = profile.targetFrameworks.join(", ");
    const solutionContext = profile.primarySolutionFile
      ? `Treat ${profile.primarySolutionFile} as the main solution context.`
      : "Treat the workspace root as the current solution context.";
    return [
      `Review ${workspaceName} against ${primary} guidance before suggesting preview-only APIs.`,
      solutionContext,
      "Prioritize ASP.NET Core, Blazor, SignalR, MAUI, Azure, and Bicep recommendations when detected."
    ];
  }

  private async scanWorkspace(rootPath: string): Promise<ScanResult> {
    const files: string[] = [];
    const projectFiles: string[] = [];
    const solutionFiles: string[] = [];
    const bicepFiles: string[] = [];

    const walk = async (directoryPath: string): Promise<void> => {
      const entries = await readdir(directoryPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) {
            continue;
          }
          await walk(path.join(directoryPath, entry.name));
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        const filePath = path.join(directoryPath, entry.name);
        files.push(filePath);

        if (entry.name.endsWith(".csproj")) {
          projectFiles.push(filePath);
        } else if (entry.name.endsWith(".sln")) {
          solutionFiles.push(filePath);
        } else if (entry.name.endsWith(".bicep")) {
          bicepFiles.push(filePath);
        }
      }
    };

    const rootStats = await stat(rootPath);
    if (!rootStats.isDirectory()) {
      throw new Error(`${rootPath} is not a directory`);
    }

    await walk(rootPath);
    return { files, projectFiles, solutionFiles, bicepFiles };
  }

  private async findContentMatch(filePaths: string[], patterns: string[]): Promise<boolean> {
    const sourceFiles = filePaths.filter(
      (filePath) =>
        filePath.endsWith(".cs") ||
        filePath.endsWith(".razor") ||
        filePath.endsWith(".bicep") ||
        filePath.endsWith(".json")
    );

    for (const filePath of sourceFiles.slice(0, 80)) {
      const contents = await readFile(filePath, "utf8");
      if (patterns.some((pattern) => contents.includes(pattern))) {
        return true;
      }
    }

    return false;
  }
}
