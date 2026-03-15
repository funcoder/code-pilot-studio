# Code Pilot Studio Project Context

## Purpose

`Code Pilot Studio` is a desktop app for AI-assisted software delivery focused on `.NET` solutions.

The product direction is intentionally not "another editor with chat".

The current thesis is:

- developers are spending less time typing code and more time reviewing AI-generated changes
- the app should be strongest at planning implementation, reviewing diffs, validating changes, and steering the AI
- the review workflow should be more important than the raw editing workflow

## Current Product Direction

The solution window is now designed around this flow:

1. open a real `.NET` solution
2. describe a feature or review request
3. let the AI generate an implementation plan
4. review the implementation steps and review lenses
5. approve the plan
6. let the AI produce the implementation result
7. inspect the resulting code changes
8. refine, apply, edit, save, and build/check

Important product decisions:

- one window per solution
- launcher window for recent/open/create actions
- solution window should stay focused on a single codebase
- `.NET` is the first-class focus for this release
- the strongest expertise areas are:
  - `ASP.NET Core`
  - `Blazor`
  - `SignalR`
  - `MAUI`
  - `Azure`
  - `Bicep`
- AI review quality matters more than code-generation flashiness
- security and DRY are core review concerns, not optional extras
- review lenses should be visible as part of plan review, not hidden until after approval
- after plan approval, the app should move into implementation result generation, not another ambiguous planning state

## UX Model

The current intended UX is:

- top: solution snapshot + feature request bar
- left: implementation steps, risks, and solution context
- right: task detail, review checks, code proof, and review thread

Things we intentionally moved away from:

- generic multi-workspace editor in one window
- a permanent "story" layer as the main concept
- a chat-first IDE layout
- a giant dashboard full of competing panels

Current language preference:

- use `feature request`, `implementation plan`, `implementation steps`, `review checks`, and `code proof`
- avoid overusing `story` unless there is a very specific reason

## Key Workflow Decisions

The app should behave like this:

- no default implementation steps should appear before the user asks for a feature/review
- after the user asks for work, the AI should generate a plan first
- security, DRY, and validation lenses should be visible with the plan
- after the plan is approved, the AI should generate implementation results automatically
- code changes should be reviewed in context of a selected implementation step
- the user must be able to:
  - accept the proposal
  - edit the working copy
  - save
  - run build/check
  - ask for changes

Longer-term intended completion flow:

- create or use a feature branch from `main`
- approve the reviewed plan
- let the assistant implement the approved work
- review the resulting changes
- commit the completed change on the feature branch

## Architecture Overview

Desktop stack:

- `Electron`
- `React`
- `TypeScript`
- `Monaco`

AI/provider integration:

- local CLI providers
- `codex`
- `claude-code`

Important renderer files:

- `src/App.tsx`
- `src/components/FeatureRequestBar.tsx`
- `src/components/StoryNavigatorPanel.tsx`
- `src/components/ChangeReviewPanel.tsx`
- `src/components/AssistantPanel.tsx`
- `src/styles.css`

Important Electron/backend files:

- `electron/main.ts`
- `electron/preload.ts`
- `electron/core/app-controller.ts`
- `electron/core/state.ts`
- `electron/ipc/contracts.ts`
- `electron/services/dotnet-expertise.ts`
- `electron/services/provider-service.ts`
- `electron/services/review-proposal-service.ts`
- `electron/services/solution-check-service.ts`

## Current Technical Decisions

### Repository Hygiene

The project should actively maintain `.gitignore` as part of normal development.

That means:

- keep local build output, caches, logs, editor settings, and temporary app state out of git
- update `.gitignore` whenever a new tool, runtime artifact, or local database appears
- treat `.gitignore` as part of project setup quality, not a one-time bootstrap file
- prefer checking in examples or templates like `.env.example`, not local machine state

### Solution Loading

Current behavior:

- opening a solution can be slow because of scanning and provider checks
- a loading progress bar is now being added so the window appears immediately and reports progress

Desired long-term behavior:

- show the solution window fast
- progressively load deeper analysis
- avoid doing expensive proposal generation during initial open

### Proposal and Review Model

`ProposedChange` is a first-class concept.

Each proposal can include:

- title
- summary
- file path
- original contents
- proposed contents
- rationale
- review checks

Review checks currently use these lenses:

- `security`
- `dry`
- `validation`

Important direction:

- these lenses should be generated and surfaced at plan review time
- they should also remain available at file/diff review time
- `Approve plan` should mean "implement this reviewed plan", not "start another review stage"

### Build/Validation

The app can run a build/check step after changes.

Current note:

- in restricted environments, NuGet access may fail
- this is an environment/network problem, not necessarily a solution problem

## Real Project Baseline

The app should be developed and tested against a real sample `.NET` solution in:

- `sample/SamplePlatform.sln`

This sample should be treated as the current baseline for:

- solution opening
- project detection
- implementation-step generation
- proposal review
- build/check flow

Future work should prefer using this real solution instead of relying only on fallback/mock UI data.

## Open Product Questions

These are still active design questions:

- how much of the planning model should be visible by default?
- should implementation steps always be shown, or only after a generated plan?
- how much of the AI thread belongs in the main window vs collapsible detail?
- should code proof stay file-focused or become chunk-focused over time?

## Immediate Priorities

Near-term priorities:

1. make solution loading feel fast and explicit
2. keep the feature request entry point obvious
3. keep the left side clean and free of fake/default planning data
4. make plan review and implementation result two clear phases
5. make approved plans trigger implementation automatically
6. use the real sample solution as the baseline for feature generation and review

## Guidance For Other AI Tools

If another AI tool works on this repo, it should:

- preserve the `.NET`-first direction
- preserve the one-window-per-solution model
- optimize for review-first workflows, not chat-first workflows
- avoid reintroducing heavy dashboard UI
- avoid bringing back default fake implementation steps on initial load
- prefer incremental, testable UX improvements
- use the sample solution as the default development scenario
