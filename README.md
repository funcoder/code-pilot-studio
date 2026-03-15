# Code Pilot Studio

`Code Pilot Studio` is an open source desktop app for AI-assisted software delivery, with an initial focus on `.NET` solutions.

## Alpha Status

This project is currently in `alpha`.

It should **not** be used against production codebases, production infrastructure, or other high-trust environments yet.

Current builds are still experimental and under active design and implementation. Expect incomplete workflows, rough edges, and changes to core behavior as the product direction continues to evolve.

The product direction is intentionally not "another editor with chat". The goal is to help developers review, approve, and validate AI-driven implementation work with much stronger support for planning, code review, security, DRY checks, and build validation.

## Current Direction

The workflow we are building toward is:

1. open a real `.NET` solution
2. describe a feature or review request
3. let `codex` or `claude-code` generate an implementation plan
4. review the plan, affected files, and review lenses
5. approve the plan
6. let the assistant implement the approved plan on a feature branch
7. review the resulting code changes and validate them
8. commit the completed change

The core thesis is that modern developers are spending less time writing code from scratch and more time reviewing, steering, and validating AI-generated work.

## Product Focus

This release is intentionally `.NET`-first.

Current first-class areas:

- `ASP.NET Core`
- `Blazor`
- `SignalR`
- `MAUI`
- `Azure`
- `Bicep`

The desktop shell and provider architecture are being kept extensible so other stack-focused editions, such as a future Rails-oriented version, can be added later.

## What Exists Today

The repo already includes a working desktop foundation with:

- `Electron + React + TypeScript + Monaco`
- one window per solution
- a launcher window for recent/open flows
- solution scanning and `.NET` project detection
- provider integration scaffolding for `codex` and `claude-code`
- a feature request flow
- implementation plan generation
- review-first UI for steps, diffs, and review checks
- build/check plumbing
- Azure investigation scaffolding

This is still an active prototype, not a finished product.

## Development Scripts

- `npm install`
- `npm run dev`
- `npm run lint`
- `npm run build`
- `npm start`

## Project Structure

Important app files:

- `electron/main.ts`
- `electron/preload.ts`
- `electron/core/app-controller.ts`
- `electron/core/state.ts`
- `electron/ipc/contracts.ts`
- `electron/services/dotnet-expertise.ts`
- `electron/services/provider-service.ts`
- `electron/services/review-proposal-service.ts`
- `electron/services/solution-check-service.ts`
- `src/App.tsx`
- `src/components/FeatureRequestBar.tsx`
- `src/components/StoryNavigatorPanel.tsx`
- `src/components/ChangeReviewPanel.tsx`
- `src/components/AssistantPanel.tsx`
- `src/styles.css`

## Real Sample Solution

The main local baseline for development is:

- `sample/SamplePlatform.sln`

This sample solution is used to test:

- solution opening
- project detection
- implementation plan generation
- review flows
- proposal generation
- build/check behavior

## Current Product Principles

- review-first beats chat-first
- one solution window should stay focused on one codebase
- security and DRY are core review concerns
- build/test validation must stay part of the flow
- avoid heavy dashboard UI
- use real projects and real provider data whenever possible

## Current Gaps

Still in progress:

- making plan review and implementation result two cleaner phases
- executing approved plans as real bounded implementation runs
- creating commits automatically on feature branches after approved execution
- generating plan-level review lenses immediately with the plan
- improving traceability from feature request -> plan -> code changes -> commit

## Notes For Contributors

- keep the app `.NET`-first for this release
- prefer review/workflow improvements over generic IDE features
- keep `.gitignore` maintained as new local artifacts appear
- use the sample solution instead of relying only on mock data
- preserve the current product direction in [PROJECT_CONTEXT.md](/Users/jonathanbuckland/projects/aicoder/PROJECT_CONTEXT.md)
