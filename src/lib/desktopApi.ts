import type {
  AppSnapshot,
  ApproveTaskInput,
  GenerateProposalsInput,
  InspectAzureInput,
  OpenWorkspaceDialogResult,
  OpenWorkspaceInput,
  RecentWorkspaceRecord,
  RequestAdviceInput,
  RunBuildCheckInput,
  WorkspaceSnapshot
} from "../../electron/ipc/contracts";

const createMockWorkspace = (): WorkspaceSnapshot => ({
  workspace: {
    id: "workspace-demo",
    name: "SamplePlatform",
    rootPath: "/Users/jonathanbuckland/projects/aicoder/sample",
    solutionPath: "/Users/jonathanbuckland/projects/aicoder/sample/SamplePlatform.sln",
    provider: "codex"
  },
  profile: {
    targetFrameworks: ["net10.0"],
    usesPreviewSdk: false,
    appModels: ["aspnet-core", "blazor", "signalr", "maui"],
    detectedStacks: [
      { kind: "dotnet", confidence: 0.99, evidence: ["Contoso.sln"] },
      { kind: "aspnet-core", confidence: 0.95, evidence: ["src/Api/Api.csproj"] },
      { kind: "blazor", confidence: 0.9, evidence: ["src/Web/App.razor"] },
      { kind: "signalr", confidence: 0.82, evidence: ["MapHub<LiveUpdatesHub>()"] },
      { kind: "bicep", confidence: 0.88, evidence: ["infra/main.bicep"] },
      { kind: "azure", confidence: 0.78, evidence: ["azure.yaml"] }
    ],
    solutionFiles: ["SamplePlatform.sln"],
    projectFiles: [
      "sample/SamplePlatform.Api/SamplePlatform.Api.csproj",
      "sample/SamplePlatform.Shared/SamplePlatform.Shared.csproj",
      "sample/SamplePlatform.Tests/SamplePlatform.Tests.csproj"
    ],
    bicepFiles: ["sample/infra/main.bicep"],
    projectCount: 3,
    primarySolutionFile: "SamplePlatform.sln",
    projects: [
      {
        id: "sample/SamplePlatform.Api/SamplePlatform.Api.csproj",
        name: "SamplePlatform.Api",
        relativePath: "sample/SamplePlatform.Api/SamplePlatform.Api.csproj",
        targetFrameworks: ["net10.0"],
        projectType: "web",
        references: ["sample/SamplePlatform.Shared/SamplePlatform.Shared.csproj"]
        ,
        startupFiles: ["sample/SamplePlatform.Api/Program.cs"],
        visibleFiles: [
          "sample/SamplePlatform.Api/Program.cs",
          "sample/SamplePlatform.Api/Properties/launchSettings.json",
          "sample/SamplePlatform.Api/appsettings.json",
          "sample/SamplePlatform.Api/appsettings.Development.json",
          "sample/SamplePlatform.Api/SamplePlatform.Api.http"
        ]
      },
      {
        id: "sample/SamplePlatform.Shared/SamplePlatform.Shared.csproj",
        name: "SamplePlatform.Shared",
        relativePath: "sample/SamplePlatform.Shared/SamplePlatform.Shared.csproj",
        targetFrameworks: ["net10.0"],
        projectType: "library",
        references: [],
        startupFiles: [],
        visibleFiles: ["sample/SamplePlatform.Shared/Class1.cs"]
      },
      {
        id: "sample/SamplePlatform.Tests/SamplePlatform.Tests.csproj",
        name: "SamplePlatform.Tests",
        relativePath: "sample/SamplePlatform.Tests/SamplePlatform.Tests.csproj",
        targetFrameworks: ["net10.0"],
        projectType: "test",
        references: [
          "sample/SamplePlatform.Api/SamplePlatform.Api.csproj",
          "sample/SamplePlatform.Shared/SamplePlatform.Shared.csproj"
        ],
        startupFiles: [],
        visibleFiles: ["sample/SamplePlatform.Tests/UnitTest1.cs"]
      }
    ]
  },
  assistantMode: "watching",
  activeProjectId: "sample/SamplePlatform.Api/SamplePlatform.Api.csproj",
  activeFilePath: "sample/SamplePlatform.Api/Program.cs",
  activeFileContents: `var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();

var app = builder.Build();

app.MapOpenApi();

app.Run();`,
  activeFileDirty: false,
  suggestions: [
    {
      id: "mock-suggestion-1",
      title: ".NET expertise pack active",
      summary:
        "Renderer is running without the Electron preload bridge, so this is mock data to keep the GUI visible while the desktop shell starts.",
      severity: "warning",
      source: "workspace"
    }
  ],
  azureFindings: [
    {
      id: "mock-azure-1",
      resourceName: "contoso-prod-app",
      category: "App Service",
      severity: "info",
      summary: "Mock Azure finding shown because the desktop bridge is unavailable in this renderer session.",
      recommendation: "Once Electron preload is attached, real az CLI findings will appear here."
    }
  ],
  providerStatuses: [
    {
      kind: "codex",
      installed: false,
      command: "codex",
      error: "Renderer fallback mode"
    },
    {
      kind: "claude-code",
      installed: false,
      command: "claude",
      error: "Renderer fallback mode"
    }
  ],
  transcript: [
    {
      id: "mock-transcript-1",
      kind: "system",
      text: "Running in renderer fallback mode. The GUI is intentionally visible even before Electron IPC is available.",
      timestamp: Date.now()
    }
  ],
  sessionState: {
    active: false,
    status: "idle",
    summary: "Fallback renderer mode"
  },
  planState: {
    status: "ready",
    source: "local-fallback",
    summary: "Fallback implementation plan is active in renderer mode.",
    lastGeneratedAt: Date.now()
  },
  nextTaskPlan: {
    id: "mock-task-1",
    goal: "Review the solution for .NET 10 readiness and Azure deployment risks.",
    steps: [
      "Inspect ASP.NET Core, shared library, and test project boundaries.",
      "Compare code assumptions with Bicep and Azure resources.",
      "Prepare a review for approval."
    ],
    commands: ["dotnet --info", "dotnet build SamplePlatform.sln", "az resource list --output table"],
    files: ["sample/", "sample/infra/main.bicep"]
  },
  proposedChanges: [
    {
      id: "proposal-program",
      title: "Harden application startup",
      summary: "Add health checks and safer default error handling.",
      category: "task",
      source: "local-fallback",
      filePath: "sample/SamplePlatform.Api/Program.cs",
      projectId: "sample/SamplePlatform.Api/SamplePlatform.Api.csproj",
      taskIndex: 0,
      originalContents: `var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();

var app = builder.Build();

app.MapOpenApi();

app.Run();`,
      proposedContents: `var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks();

var app = builder.Build();

app.UseExceptionHandler();
app.MapOpenApi();
app.MapHealthChecks("/health");

app.Run();`,
      rationale: [
        "Adds safer runtime defaults for an ASP.NET Core app.",
        "Introduces a health probe that can be reused in Azure and test workflows."
      ],
      reviewChecks: [
        {
          id: "proposal-program-security",
          lens: "security",
          status: "watch",
          title: "Security review",
          detail: "Check exception handling and any future auth wiring before accepting this startup change."
        },
        {
          id: "proposal-program-dry",
          lens: "dry",
          status: "pass",
          title: "DRY review",
          detail: "This follows a common ASP.NET Core startup pattern rather than introducing duplicate logic."
        },
        {
          id: "proposal-program-validation",
          lens: "validation",
          status: "action",
          title: "Validation review",
          detail: "Run build and a targeted health-check verification after applying this change."
        }
      ]
    }
  ],
  proposalState: {
    status: "fallback",
    source: "local-fallback",
    summary: "Fallback proposals are active in renderer mode.",
    lastGeneratedAt: Date.now()
  }
});

const createMockSnapshot = (): AppSnapshot => ({
  workspaces: [createMockWorkspace()],
  activeWorkspaceId: "workspace-demo",
  loadingState: undefined
});

type DesktopApiShape = {
  getSnapshot: () => Promise<AppSnapshot>;
  openWorkspaceDialog: () => Promise<OpenWorkspaceDialogResult>;
  createWorkspaceDialog: () => Promise<OpenWorkspaceDialogResult>;
  openWorkspace: (input: OpenWorkspaceInput) => Promise<AppSnapshot>;
  openWorkspaceWindow: (input: OpenWorkspaceInput) => Promise<{ ok: boolean }>;
  getRecentWorkspaces: () => Promise<RecentWorkspaceRecord[]>;
  setActiveProject: (workspaceId: string, projectId: string) => Promise<AppSnapshot>;
  setActiveFile: (workspaceId: string, filePath: string) => Promise<AppSnapshot>;
  updateActiveFile: (workspaceId: string, contents: string) => Promise<AppSnapshot>;
  saveActiveFile: (workspaceId: string) => Promise<AppSnapshot>;
  setActiveWorkspace: (workspaceId: string) => Promise<AppSnapshot>;
  requestAdvice: (input: RequestAdviceInput) => Promise<AppSnapshot>;
  inspectAzure: (input: InspectAzureInput) => Promise<AppSnapshot>;
  approveTask: (input: ApproveTaskInput) => Promise<AppSnapshot>;
  generateProposals: (input: GenerateProposalsInput) => Promise<AppSnapshot>;
  runBuildCheck: (input: RunBuildCheckInput) => Promise<AppSnapshot>;
  subscribeToSnapshots: (listener: (snapshot: AppSnapshot) => void) => () => void;
};

const fallbackApi: DesktopApiShape = {
  async getSnapshot() {
    return createMockSnapshot();
  },
  async openWorkspaceDialog() {
    return {
      canceled: false,
      rootPath: "/Users/jonathanbuckland/projects/aicoder/sample",
      solutionPath: "/Users/jonathanbuckland/projects/aicoder/sample/SamplePlatform.sln"
    };
  },
  async createWorkspaceDialog() {
    return {
      canceled: false,
      rootPath: "/Users/jonathanbuckland/projects/aicoder/sample/NewSolution"
    };
  },
  async openWorkspace(_input) {
    return createMockSnapshot();
  },
  async openWorkspaceWindow(_input) {
    return { ok: true };
  },
  async getRecentWorkspaces() {
    return [
      {
        name: "SamplePlatform",
        rootPath: "/Users/jonathanbuckland/projects/aicoder/sample",
        solutionPath: "/Users/jonathanbuckland/projects/aicoder/sample/SamplePlatform.sln",
        lastOpenedAt: Date.now()
      }
    ];
  },
  async setActiveProject(_workspaceId, projectId) {
    const snapshot = createMockSnapshot();
    snapshot.workspaces[0].activeProjectId = projectId;
    const project = snapshot.workspaces[0].profile.projects.find((item) => item.id === projectId);
    snapshot.workspaces[0].activeFilePath = project?.visibleFiles[0];
    return snapshot;
  },
  async setActiveFile(_workspaceId, filePath) {
    const snapshot = createMockSnapshot();
    snapshot.workspaces[0].activeFilePath = filePath;
    snapshot.workspaces[0].activeFileContents = `// Fallback file preview\n// ${filePath}`;
    snapshot.workspaces[0].activeFileDirty = false;
    return snapshot;
  },
  async updateActiveFile(_workspaceId, contents) {
    const snapshot = createMockSnapshot();
    snapshot.workspaces[0].activeFileContents = contents;
    snapshot.workspaces[0].activeFileDirty = true;
    return snapshot;
  },
  async saveActiveFile(_workspaceId) {
    const snapshot = createMockSnapshot();
    snapshot.workspaces[0].activeFileDirty = false;
    return snapshot;
  },
  async setActiveWorkspace(_workspaceId) {
    return createMockSnapshot();
  },
  async requestAdvice(input) {
    const snapshot = createMockSnapshot();
    snapshot.workspaces[0].planState = {
      status: "ready",
      source: "local-fallback",
      summary: "Fallback implementation plan generated in renderer mode.",
      lastGeneratedAt: Date.now()
    };
    snapshot.workspaces[0].transcript.push({
      id: `mock-user-${Date.now()}`,
      kind: "user",
      text: input.prompt,
      timestamp: Date.now()
    });
    snapshot.workspaces[0].transcript.push({
      id: `mock-assistant-${Date.now()}`,
      kind: "assistant",
      text: "The Electron preload bridge is unavailable, so this is a fallback response from the renderer.",
      timestamp: Date.now()
    });
    return snapshot;
  },
  async inspectAzure(_input) {
    return createMockSnapshot();
  },
  async approveTask(_input) {
    return createMockSnapshot();
  },
  async generateProposals(_input) {
    const snapshot = createMockSnapshot();
    snapshot.workspaces[0].proposalState = {
      status: "fallback",
      source: "local-fallback",
      summary: "Regenerated fallback proposals in renderer mode.",
      lastGeneratedAt: Date.now()
    };
    return snapshot;
  },
  async runBuildCheck(_input) {
    const snapshot = createMockSnapshot();
    snapshot.workspaces[0].transcript.push({
      id: `mock-build-${Date.now()}`,
      kind: "tool",
      text: "dotnet build /Users/jonathanbuckland/projects/aicoder/sample/SamplePlatform.sln",
      timestamp: Date.now()
    });
    snapshot.workspaces[0].transcript.push({
      id: `mock-test-${Date.now()}`,
      kind: "tool",
      text: "dotnet test /Users/jonathanbuckland/projects/aicoder/sample/SamplePlatform.sln --no-build",
      timestamp: Date.now()
    });
    snapshot.workspaces[0].transcript.push({
      id: `mock-build-ok-${Date.now()}`,
      kind: "system",
      text: "Build and test checks passed in renderer fallback mode.",
      timestamp: Date.now()
    });
    return snapshot;
  },
  subscribeToSnapshots(_listener) {
    return () => undefined;
  }
};

export const desktopApi: DesktopApiShape = window.aiCoder ?? fallbackApi;
export const isDesktopBridgeAvailable = Boolean(window.aiCoder);
