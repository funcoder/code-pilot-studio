import type {
  AzureFinding,
  DotNetSolutionProfile,
  StackDetection,
  TaskPlan
} from "../ipc/contracts.js";

const createStack = (
  kind: StackDetection["kind"],
  confidence: number,
  evidence: string[]
): StackDetection => ({
  kind,
  confidence,
  evidence
});

export const defaultDotNetProfile: DotNetSolutionProfile = {
  targetFrameworks: ["net10.0"],
  usesPreviewSdk: false,
  appModels: ["aspnet-core", "blazor", "signalr", "maui"],
  solutionFiles: [],
  projectFiles: [],
  bicepFiles: [],
  projectCount: 0,
  primarySolutionFile: undefined,
  projects: [],
  detectedStacks: [
    createStack("dotnet", 0.98, ["global.json", "*.sln", "*.csproj"]),
    createStack("aspnet-core", 0.96, ["Sdk=Microsoft.NET.Sdk.Web"]),
    createStack("blazor", 0.93, ["Components/", "_Imports.razor"]),
    createStack("signalr", 0.9, ["MapHub", "Hub<T>"]),
    createStack("maui", 0.82, ["UseMaui", "Platforms/"]),
    createStack("bicep", 0.88, ["*.bicep", "module"]),
    createStack("azure", 0.78, ["azd", "appsettings.Production.json"])
  ]
};

export const starterSuggestions = [
  {
    id: "sig-001",
    title: "SignalR production review",
    summary:
      "Check sticky-session assumptions and decide whether Azure SignalR Service should be recommended for scale-out.",
    severity: "warning",
    source: "workspace",
    lens: "validation",
    recommendation:
      "Review connection scaling and hosting assumptions before accepting infrastructure-facing changes.",
    actionPrompt:
      "Review the current SignalR hosting approach and recommend safer production-scale options."
  },
  {
    id: "blazor-001",
    title: "Blazor render-mode alignment",
    summary:
      "Inspect component boundaries and confirm interactive render modes are only enabled where needed.",
    severity: "info",
    source: "provider",
    lens: "dry",
    recommendation:
      "Prefer the existing render-mode pattern already used in the solution instead of introducing a one-off."
  },
  {
    id: "bicep-001",
    title: "Bicep hardening",
    summary:
      "Add lint and what-if review to the default infra workflow before deployment recommendations are surfaced.",
    severity: "warning",
    source: "azure",
    lens: "security",
    recommendation:
      "Run a least-privilege and deployment-safety review before accepting infra recommendations.",
    actionPrompt:
      "Review the Bicep deployment for security and deployment-safety issues and suggest improvements."
  }
] as const;

export const starterAzureFindings: AzureFinding[] = [
  {
    id: "azure-001",
    resourceName: "prod-signalr-hub",
    category: "SignalR",
    severity: "warning",
    summary: "Service mode and unit count should be reviewed for peak connection load.",
    recommendation: "Validate server mode, negotiated transport usage, and scaling thresholds."
  },
  {
    id: "azure-002",
    resourceName: "shared-app-config",
    category: "Configuration",
    severity: "info",
    summary: "Centralized configuration exists but secret references were not yet correlated to app startup code.",
    recommendation: "Compare App Configuration / Key Vault references with strongly typed options registration."
  }
];

export const starterTaskPlan: TaskPlan = {
  id: "task-001",
  goal: "Review the current solution for .NET 10 readiness and Azure deployment risks.",
  steps: [
    "Inspect the solution profile and active projects.",
    "Compare local hosting/configuration patterns to Azure resources.",
    "Draft an actionable review with SignalR, Blazor, and Bicep recommendations."
  ],
  commands: ["dotnet --info", "az account show", "az resource list --output table"],
  files: ["src/", "infra/main.bicep", "appsettings.Production.json"]
};
