#!/usr/bin/env bun

import { BunContext, BunRuntime } from "@effect/platform-bun"
import { Command as CliCommand } from "@effect/cli"
import { Effect, Layer } from "effect"
import { pimuxCommand } from "./Cli.js"
import { CmuxClientLive } from "./Cmux.js"
import { ConfigServiceLive } from "./Config.js"
import { GitServiceLive } from "./Git.js"
import { HookRunnerLive } from "./HookRunner.js"
import { TaskManagerLive } from "./TaskManager.js"
import { WorkspaceOrchestratorLive } from "./Workspace.js"

// ── Layer composition ────────────────────────────────────────

// ConfigService depends on GitService
const ConfigLayer = ConfigServiceLive.pipe(
  Layer.provide(GitServiceLive)
)

// TaskManager depends on ConfigService
const TaskManagerLayer = TaskManagerLive.pipe(
  Layer.provide(ConfigLayer)
)

// WorkspaceOrchestrator depends on everything
const OrchestratorLayer = WorkspaceOrchestratorLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      CmuxClientLive,
      GitServiceLive,
      HookRunnerLive,
      TaskManagerLayer,
      ConfigLayer
    )
  )
)

// Full application layer
const AppLayer = Layer.mergeAll(
  CmuxClientLive,
  GitServiceLive,
  HookRunnerLive,
  ConfigLayer,
  TaskManagerLayer,
  OrchestratorLayer
)

// ── CLI execution ────────────────────────────────────────────

const cli = pimuxCommand.pipe(
  CliCommand.provide(AppLayer),
  CliCommand.run({
    name: "pimux",
    version: "0.1.0",
  })
)

cli(process.argv).pipe(
  Effect.provide(BunContext.layer),
  BunRuntime.runMain
)
