import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  AzureFinding,
  DotNetSolutionProfile,
  InspectAzureInput,
  WorkspaceSummary
} from "../ipc/contracts.js";
import { CommandRunner } from "./command-runner.js";

interface AzureAccountInfo {
  name?: string;
  id?: string;
  tenantId?: string;
}

interface AzureResourceInfo {
  id?: string;
  name?: string;
  type?: string;
  location?: string;
  resourceGroup?: string;
}

export class AzureInspectionService {
  constructor(private readonly commandRunner = new CommandRunner()) {}

  async inspect(
    workspace: WorkspaceSummary,
    profile: DotNetSolutionProfile,
    input: InspectAzureInput
  ): Promise<AzureFinding[]> {
    const findings: AzureFinding[] = [];
    const azureConfigDir = await this.commandRunner.createAzureConfigDir();
    const extraEnv = { AZURE_CONFIG_DIR: azureConfigDir };

    const account = await this.commandRunner.run(
      "az",
      ["account", "show", "--output", "json"],
      { extraEnv }
    );

    if (!account.ok) {
      return [
        {
          id: `azure-auth-${Date.now()}`,
          resourceName: "Azure CLI",
          category: "Authentication",
          severity: "warning",
          summary: "Azure CLI is installed, but no readable authenticated session was available.",
          recommendation:
            "Run `az login` in your normal shell, then reopen the inspection. The app keeps Azure reads scoped and read-only."
        }
      ];
    }

    const accountInfo = JSON.parse(account.stdout) as AzureAccountInfo;
    const resourceArgs = ["resource", "list", "--output", "json"];
    if (input.subscription ?? accountInfo.id) {
      resourceArgs.push("--subscription", input.subscription ?? accountInfo.id!);
    }

    const resources = await this.commandRunner.run("az", resourceArgs, {
      extraEnv,
      timeoutMs: 20_000
    });

    if (!resources.ok) {
      findings.push({
        id: `azure-resource-${Date.now()}`,
        resourceName: "Azure resources",
        category: "Inspection",
        severity: "warning",
        summary: "The Azure resource inventory could not be read successfully.",
        recommendation:
          "Check subscription permissions and try a narrower scope. Keep the first release focused on read-only inventory and recommendation generation."
      });
      return findings;
    }

    const resourceList = JSON.parse(resources.stdout) as AzureResourceInfo[];
    const signalrResources = resourceList.filter((resource) =>
      resource.type?.toLowerCase().includes("signalrservice")
    );
    const appServices = resourceList.filter((resource) =>
      resource.type?.toLowerCase().includes("microsoft.web/sites")
    );

    findings.push({
      id: `azure-subscription-${Date.now()}`,
      resourceName: accountInfo.name ?? "Azure subscription",
      category: "Inventory",
      severity: "info",
      summary: `Loaded ${resourceList.length} resources for subscription ${accountInfo.name ?? accountInfo.id ?? "unknown"}.`,
      recommendation:
        "Use this inventory to correlate deployed resources with the current .NET solution before generating changes."
    });

    if (signalrResources.length > 0 && profile.appModels.includes("signalr")) {
      findings.push({
        id: `azure-signalr-${Date.now()}`,
        resourceName: signalrResources[0].name ?? "SignalR resource",
        category: "SignalR",
        severity: "info",
        summary: "SignalR resources exist for a solution that also uses SignalR locally.",
        recommendation:
          "Review negotiated transports, connection mode, and scale assumptions before rollout."
      });
    } else if (profile.appModels.includes("signalr")) {
      findings.push({
        id: `azure-signalr-gap-${Date.now()}`,
        resourceName: "SignalR",
        category: "Architecture",
        severity: "warning",
        summary: "SignalR code was detected locally, but no Azure SignalR resource was found in the inspected subscription.",
        recommendation:
          "Confirm whether self-hosted scale-out is intentional or whether Azure SignalR should be recommended."
      });
    }

    if (appServices.length > 0 && profile.bicepFiles.length === 0) {
      findings.push({
        id: `azure-bicep-gap-${Date.now()}`,
        resourceName: appServices[0].name ?? "App Service",
        category: "Bicep",
        severity: "warning",
        summary: "Azure web resources were found, but no Bicep files were detected in the workspace.",
        recommendation:
          "Consider bringing infrastructure under Bicep or linking the infra repo as a second workspace."
      });
    }

    const bicepFindings = await this.inspectBicepFiles(workspace, profile);
    return [...findings, ...bicepFindings];
  }

  private async inspectBicepFiles(
    workspace: WorkspaceSummary,
    profile: DotNetSolutionProfile
  ): Promise<AzureFinding[]> {
    const findings: AzureFinding[] = [];

    for (const relativeFile of profile.bicepFiles.slice(0, 5)) {
      const absoluteFile = path.join(workspace.rootPath, relativeFile);
      const contents = await readFile(absoluteFile, "utf8");

      if (!contents.includes("module ")) {
        findings.push({
          id: `bicep-module-${relativeFile}`,
          resourceName: relativeFile,
          category: "Bicep",
          severity: "info",
          summary: "This Bicep file appears to be a single-file deployment without module composition.",
          recommendation:
            "Consider Azure Verified Modules or internal modules for reusable resources and clearer review boundaries."
        });
      }

      if (!contents.includes("@description(")) {
        findings.push({
          id: `bicep-description-${relativeFile}`,
          resourceName: relativeFile,
          category: "Bicep",
          severity: "warning",
          summary: "Parameters or outputs may be undocumented in this Bicep file.",
          recommendation:
            "Add descriptions and typed inputs so the assistant can produce better infra-aware guidance."
        });
      }
    }

    return findings;
  }
}
