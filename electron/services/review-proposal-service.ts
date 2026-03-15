import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  AssistantSuggestion,
  DotNetSolutionProfile,
  ProposedChange,
  ReviewCheck,
  TaskPlan,
  WorkspaceSummary
} from "../ipc/contracts.js";

interface ProposalContext {
  activeProjectId?: string;
  prompt?: string;
  taskPlan?: TaskPlan;
  suggestions?: AssistantSuggestion[];
}

interface ProposalPatch {
  summary: string;
  rationale: string[];
  proposed: string;
}

const tryRead = async (filePath: string): Promise<string | undefined> => {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
};

const withInsertedLine = (
  code: string,
  anchor: string,
  insertion: string
): string => {
  if (code.includes(insertion.trim())) {
    return code;
  }
  return code.includes(anchor) ? code.replace(anchor, `${anchor}\n${insertion}`) : code;
};

const buildProgramProposal = (
  original: string,
  category: ProposedChange["category"]
): ProposalPatch => {
  let proposed = original;
  proposed = withInsertedLine(proposed, "builder.Services.AddOpenApi();", "builder.Services.AddProblemDetails();");
  proposed = withInsertedLine(proposed, "builder.Services.AddProblemDetails();", "builder.Services.AddHealthChecks();");
  proposed = withInsertedLine(proposed, "var app = builder.Build();", "app.UseExceptionHandler();");
  proposed = withInsertedLine(proposed, "app.MapOpenApi();", 'app.MapHealthChecks("/health");');

  return {
    summary:
      category === "risk"
        ? "Tighten production safety around startup and runtime diagnostics."
        : "Add a small set of production-oriented web host improvements.",
    rationale: [
      "Registers problem details for safer API error responses.",
      "Adds health checks so Azure and local tooling can probe service health.",
      "Wires a default exception handler before request execution."
    ],
    proposed
  };
};

const buildLoginProgramProposal = (original: string): ProposalPatch => {
  let proposed = original;
  proposed = withInsertedLine(proposed, "builder.Services.AddOpenApi();", "builder.Services.AddAuthentication(\"Cookies\").AddCookie();");
  proposed = withInsertedLine(proposed, "builder.Services.AddAuthentication(\"Cookies\").AddCookie();", "builder.Services.AddAuthorization();");
  proposed = withInsertedLine(proposed, "var app = builder.Build();", "app.UseAuthentication();");
  proposed = withInsertedLine(proposed, "app.UseAuthentication();", "app.UseAuthorization();");

  if (!proposed.includes("app.MapPost(\"/login\"")) {
    proposed = proposed.replace(
      "app.MapOpenApi();",
      `app.MapOpenApi();

app.MapPost("/login", (string username) =>
{
    if (string.IsNullOrWhiteSpace(username))
    {
        return Results.BadRequest();
    }

    return Results.Ok(new { Username = username });
});

app.MapPost("/logout", () => Results.Ok());

app.MapGet("/me", () => Results.Ok(new { IsAuthenticated = true }))
   .RequireAuthorization();`
    );
  }

  return {
    summary: "Add the first login/authentication wiring for the web app.",
    rationale: [
      "Registers cookie authentication and authorization for the web app.",
      "Introduces login, logout, and current-user endpoints as the first reviewable auth flow.",
      "Keeps the initial feature small enough to review before refining the final auth approach."
    ],
    proposed
  };
};

const buildAppSettingsProposal = (original: string): ProposalPatch => {
  let proposed = original;
  if (!proposed.includes('"Observability"')) {
    const trimmed = proposed.trim();
    if (trimmed === "{}") {
      proposed = '{\n  "Observability": {\n    "HealthEndpoint": "/health",\n    "CaptureProblemDetails": true\n  }\n}';
    } else if (trimmed.endsWith("}")) {
      proposed = proposed.replace(
        /\}\s*$/,
        ',\n  "Observability": {\n    "HealthEndpoint": "/health",\n    "CaptureProblemDetails": true\n  }\n}'
      );
    }
  }

  return {
    summary: "Introduce a small observability block to match the proposed runtime changes.",
    rationale: [
      "Keeps reviewable configuration near the code changes.",
      "Makes health endpoint assumptions explicit for deployment and operations."
    ],
    proposed
  };
};

const buildLoginAppSettingsProposal = (original: string): ProposalPatch => {
  let proposed = original;
  if (!proposed.includes('"Authentication"')) {
    const trimmed = proposed.trim();
    if (trimmed === "{}") {
      proposed = '{\n  "Authentication": {\n    "LoginPath": "/login",\n    "LogoutPath": "/logout"\n  }\n}';
    } else if (trimmed.endsWith("}")) {
      proposed = proposed.replace(
        /\}\s*$/,
        ',\n  "Authentication": {\n    "LoginPath": "/login",\n    "LogoutPath": "/logout"\n  }\n}'
      );
    }
  }

  return {
    summary: "Add basic authentication settings for the login flow.",
    rationale: [
      "Makes login and logout endpoints explicit in configuration.",
      "Creates a review point for how auth settings should evolve later."
    ],
    proposed
  };
};

const buildBicepProposal = (original: string): { summary: string; rationale: string[]; proposed: string } => {
  let proposed = original;
  if (!proposed.includes("healthEndpoint")) {
    proposed = `${original.trim()}\n\n@description('Health endpoint for app monitoring')\nparam healthEndpoint string = '/health'\n`;
  }

  return {
    summary: "Expose a health endpoint value so app and infra expectations stay aligned.",
    rationale: [
      "Connects runtime health checks with infrastructure expectations.",
      "Makes the deployment contract more visible during review."
    ],
    proposed
  };
};

const buildTestProposal = (original: string): ProposalPatch => {
  let proposed = original;
  if (!proposed.includes("Health_endpoint")) {
    proposed = `${original.trim()}\n\n[TestMethod]\npublic void Health_endpoint_should_be_available()\n{\n    Assert.IsTrue(true);\n}\n`;
  }

  return {
    summary: "Add a placeholder test that marks the new health endpoint as part of the review scope.",
    rationale: [
      "Prompts the developer to think about verification alongside implementation.",
      "Keeps the implementation plan connected to test coverage."
    ],
    proposed
  };
};

const buildLoginTestProposal = (original: string): ProposalPatch => {
  let proposed = original;
  if (!proposed.includes("Login_endpoint_should_return_success")) {
    proposed = `${original.trim()}\n\n[TestMethod]\npublic void Login_endpoint_should_return_success_for_valid_user()\n{\n    Assert.IsTrue(true);\n}\n`;
  }

  return {
    summary: "Mark the login flow for validation with an initial test placeholder.",
    rationale: [
      "Keeps the login feature connected to validation from the start.",
      "Makes room for replacing the placeholder with a real authentication test next."
    ],
    proposed
  };
};

export const buildReviewChecks = (
  filePath: string,
  category: ProposedChange["category"],
  rationale: string[]
): ReviewCheck[] => {
  const lower = filePath.toLowerCase();
  const isConfig = lower.endsWith("appsettings.json") || lower.endsWith(".json");
  const isInfrastructure = lower.endsWith(".bicep");
  const isStartup = lower.endsWith("program.cs");
  const isTest = lower.includes("test");

  return [
    {
      id: `${filePath}-security`,
      lens: "security",
      status: isStartup || isConfig || isInfrastructure ? "watch" : "pass",
      title: "Security review",
      detail: isStartup
        ? "Check exception handling, auth flow, and any new endpoints before accepting."
        : isConfig
          ? "Make sure no secrets or unsafe defaults are introduced in configuration."
          : isInfrastructure
            ? "Review deployment settings for least privilege and environment-safe defaults."
            : "No obvious security-specific concern detected in this proposal."
    },
    {
      id: `${filePath}-dry`,
      lens: "dry",
      status: category === "risk" || isConfig ? "watch" : "pass",
      title: "DRY review",
      detail: isInfrastructure
        ? "Confirm this does not duplicate an existing Bicep module or shared infra parameter."
        : isConfig
          ? "Check whether this configuration already exists in another environment file."
          : "Make sure the implementation follows an existing solution pattern instead of introducing a one-off."
    },
    {
      id: `${filePath}-validation`,
      lens: "validation",
      status: isTest ? "pass" : "action",
      title: "Validation review",
      detail: isTest
        ? "A test file is part of the proposal, so validation is already in scope."
        : rationale.some((line) => line.toLowerCase().includes("health") || line.toLowerCase().includes("test"))
          ? "Build and targeted tests should confirm the proposed behavior after acceptance."
          : "Add or run focused validation after applying this change."
    }
  ];
};

export class ReviewProposalService {
  async buildProposals(
    workspace: WorkspaceSummary,
    profile: DotNetSolutionProfile,
    context: ProposalContext = {}
  ): Promise<ProposedChange[]> {
    const proposals: ProposedChange[] = [];
    const activeProject =
      profile.projects.find((project) => project.id === context.activeProjectId) ?? profile.projects[0];
    const taskPlan = context.taskPlan;
    const suggestions = context.suggestions ?? [];
    const prompt = context.prompt?.toLowerCase() ?? "";
    const isLoginFeature = prompt.includes("login") || prompt.includes("auth");

    if (activeProject) {
      const programFile = activeProject.visibleFiles.find((file) => file.toLowerCase().endsWith("program.cs"));
      if (programFile) {
        const absolutePath = path.join(workspace.rootPath, programFile);
        const original = await tryRead(absolutePath);
        if (original) {
          const category: ProposedChange["category"] =
            suggestions.some((item) => item.severity === "warning") ? "risk" : "task";
          const patch = isLoginFeature
            ? buildLoginProgramProposal(original)
            : buildProgramProposal(original, category);
          proposals.push({
            id: `proposal-${programFile}`,
            title: isLoginFeature ? "Wire login/authentication into startup" : "Harden application startup",
            summary: patch.summary,
            category,
            source: "local-fallback",
            filePath: programFile,
            projectId: activeProject.id,
            taskIndex: isLoginFeature ? 1 : 0,
            originalContents: original,
            proposedContents: patch.proposed,
            rationale: patch.rationale,
            reviewChecks: buildReviewChecks(programFile, category, patch.rationale)
          });
        }
      }

      const appSettingsFile = activeProject.visibleFiles.find((file) =>
        file.toLowerCase().endsWith("appsettings.json")
      );
      if (appSettingsFile) {
        const absolutePath = path.join(workspace.rootPath, appSettingsFile);
        const original = await tryRead(absolutePath);
        if (original) {
          const patch = isLoginFeature
            ? buildLoginAppSettingsProposal(original)
            : buildAppSettingsProposal(original);
          proposals.push({
            id: `proposal-${appSettingsFile}`,
            title: isLoginFeature
              ? "Add login configuration defaults"
              : "Align configuration with runtime changes",
            summary: patch.summary,
            category: "task",
            source: "local-fallback",
            filePath: appSettingsFile,
            projectId: activeProject.id,
            taskIndex: isLoginFeature ? 2 : 1,
            originalContents: original,
            proposedContents: patch.proposed,
            rationale: patch.rationale,
            reviewChecks: buildReviewChecks(appSettingsFile, "task", patch.rationale)
          });
        }
      }
    }

    const testProject = profile.projects.find((project) => project.projectType === "test");
    const testFile = testProject?.visibleFiles.find((file) => file.toLowerCase().endsWith(".cs"));
    if (testProject && testFile) {
      const absolutePath = path.join(workspace.rootPath, testFile);
      const original = await tryRead(absolutePath);
      if (original) {
        const patch = isLoginFeature ? buildLoginTestProposal(original) : buildTestProposal(original);
        proposals.push({
          id: `proposal-${testFile}`,
          title: isLoginFeature
            ? "Add login validation coverage"
            : "Keep test coverage in the implementation plan",
          summary: patch.summary,
          category: "task",
          source: "local-fallback",
          filePath: testFile,
          projectId: testProject.id,
          taskIndex: isLoginFeature ? 4 : 2,
          originalContents: original,
          proposedContents: patch.proposed,
          rationale: patch.rationale,
          reviewChecks: buildReviewChecks(testFile, "task", patch.rationale)
        });
      }
    }

    const bicepFile = profile.bicepFiles[0];
    if (bicepFile && !isLoginFeature) {
      const absolutePath = path.join(workspace.rootPath, bicepFile);
      const original = await tryRead(absolutePath);
      if (original) {
        const patch = buildBicepProposal(original);
        proposals.push({
          id: `proposal-${bicepFile}`,
          title: "Match infra expectations to runtime health",
          summary: patch.summary,
          category: "risk",
          source: "local-fallback",
          filePath: bicepFile,
          taskIndex: taskPlan?.steps.length ? Math.min(1, taskPlan.steps.length - 1) : undefined,
          originalContents: original,
          proposedContents: patch.proposed,
          rationale: patch.rationale,
          reviewChecks: buildReviewChecks(bicepFile, "risk", patch.rationale)
        });
      }
    }

    return proposals;
  }
}
