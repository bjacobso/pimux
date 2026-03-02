import { Context, Effect, Layer } from "effect"
import { CmuxClient, type CmuxError } from "./Cmux.js"
import { GitService, type GitError } from "./Git.js"
import { ConfigService } from "./Config.js"
import { HookRunner, type HookError } from "./HookRunner.js"
import {
  TaskManager,
  type TaskNotFoundError,
  type TaskPersistenceError,
  type InvalidTransitionError,
} from "./TaskManager.js"
import type { Task } from "./Task.js"
import { slugify } from "./Task.js"
import * as nodePath from "node:path"

// --- Service definition ---

export class WorkspaceOrchestrator extends Context.Tag(
  "WorkspaceOrchestrator"
)<
  WorkspaceOrchestrator,
  {
    /** Launch a new task: worktree + workspace + pi agent */
    readonly launchTask: (
      name: string
    ) => Effect.Effect<
      Task,
      | TaskNotFoundError
      | InvalidTransitionError
      | TaskPersistenceError
      | GitError
      | CmuxError
      | HookError
    >

    /** Send a notification for a task */
    readonly notifyTask: (
      taskId: string,
      message: string
    ) => Effect.Effect<
      void,
      | TaskNotFoundError
      | TaskPersistenceError
      | CmuxError
      | InvalidTransitionError
    >

    /** Switch to a task's workspace and show diff */
    readonly reviewTask: (
      taskId: string
    ) => Effect.Effect<
      string,
      | TaskNotFoundError
      | TaskPersistenceError
      | CmuxError
      | GitError
      | InvalidTransitionError
    >

    /** Close a task: teardown hooks, close workspace, remove worktree */
    readonly closeTask: (
      taskId: string
    ) => Effect.Effect<
      void,
      | TaskNotFoundError
      | TaskPersistenceError
      | InvalidTransitionError
      | CmuxError
      | GitError
      | HookError
    >
  }
>() {}

// --- Live implementation ---

export const WorkspaceOrchestratorLive = Layer.effect(
  WorkspaceOrchestrator,
  Effect.gen(function* () {
    const cmux = yield* CmuxClient
    const git = yield* GitService
    const configService = yield* ConfigService
    const hookRunner = yield* HookRunner
    const taskManager = yield* TaskManager

    return {
      launchTask: (name) =>
        Effect.gen(function* () {
          const config = yield* configService.load()
          const pimuxDir = yield* configService.pimuxDir()
          const slug = slugify(name)
          const branch = `pimux/${slug}`
          const worktreePath = nodePath.join(pimuxDir, "worktrees", slug)

          // 1. Create task record
          const task = yield* taskManager.create(name, worktreePath, branch)
          yield* Effect.log(`Created task: ${task.id} (${task.name})`)

          // 2. Create git worktree
          yield* git.createWorktree(worktreePath, branch)
          yield* Effect.log(`Created worktree at ${worktreePath}`)

          // 3. Run setup hooks
          yield* taskManager.transition(task.id, "setting_up")
          if (config.setup.length > 0) {
            yield* hookRunner.runHooks(config.setup, worktreePath)
            yield* Effect.log(`Setup hooks completed`)
          }

          // 4. Create cmux workspace
          const workspaceRaw = yield* cmux.createWorkspace()
          const workspaceId = tryParseId(workspaceRaw)
          yield* cmux.renameWorkspace(`🤖 ${name}`, workspaceId)
          yield* Effect.log(`Created cmux workspace: ${workspaceId}`)

          // 5. Create a second pane (human shell)
          const paneRaw = yield* cmux.newPane({
            direction: "right",
            workspace: workspaceId,
          })
          const shellSurfaceId = tryParseId(paneRaw)
          yield* Effect.log(`Created shell pane: ${shellSurfaceId}`)

          // 6. Launch pi in the first (agent) pane
          yield* cmux.send(`cd ${worktreePath} && pi`, {
            workspace: workspaceId,
          })

          // 7. Set up human shell in second pane
          yield* cmux.send(`cd ${worktreePath}`, {
            workspace: workspaceId,
            surface: shellSurfaceId,
          })

          // 8. Update sidebar
          yield* cmux.setStatus("agent", "running", {
            workspace: workspaceId,
            icon: "▶",
            color: "#22c55e",
          })
          yield* cmux.setProgress(0.1, {
            label: "Agent started",
            workspace: workspaceId,
          })
          yield* cmux.log(`Created worktree, launched pi agent`, {
            workspace: workspaceId,
            source: "pimux",
          })

          // 9. Transition to running + save cmux IDs
          yield* taskManager.transition(task.id, "running")
          const updatedTask = yield* taskManager.update(task.id, {
            cmuxWorkspaceId: workspaceId,
            cmuxShellSurfaceId: shellSurfaceId,
          })

          yield* Effect.log(
            `Task "${name}" is running in workspace ${workspaceId}`
          )
          return updatedTask
        }),

      notifyTask: (taskId, message) =>
        Effect.gen(function* () {
          const task = yield* taskManager.get(taskId)
          const workspaceId = task.cmuxWorkspaceId ?? ""

          if (workspaceId) {
            yield* cmux.notify(message, {
              workspace: workspaceId,
              subtitle: task.name,
            })
            yield* cmux.setStatus("agent", "needs review", {
              workspace: workspaceId,
              icon: "⏸",
              color: "#eab308",
            })
          }

          if (task.state === "running") {
            yield* taskManager.transition(taskId, "needs_review")
          }
        }),

      reviewTask: (taskId) =>
        Effect.gen(function* () {
          const task = yield* taskManager.get(taskId)
          const workspaceId = task.cmuxWorkspaceId ?? ""

          // Focus the workspace
          if (workspaceId) {
            yield* cmux.selectWorkspace(workspaceId)
            yield* cmux.setStatus("agent", "reviewing", {
              workspace: workspaceId,
              icon: "👀",
              color: "#3b82f6",
            })
          }

          // Get the diff
          const diff = yield* git.diff(task.worktreePath)
          const stat = yield* git.diffStat(task.worktreePath)

          if (workspaceId) {
            yield* cmux.log(`Review started — ${stat || "no changes"}`, {
              workspace: workspaceId,
              source: "pimux",
            })
          }

          return diff || "(no changes)"
        }),

      closeTask: (taskId) =>
        Effect.gen(function* () {
          const task = yield* taskManager.get(taskId)
          const config = yield* configService.load()
          const workspaceId = task.cmuxWorkspaceId ?? ""

          // Run teardown hooks
          if (config.teardown.length > 0) {
            yield* hookRunner
              .runHooks(config.teardown, task.worktreePath)
              .pipe(
                Effect.catchAll((err) =>
                  Effect.log(`Teardown hook failed: ${err.message}`)
                )
              )
          }

          // Close cmux workspace
          if (workspaceId) {
            yield* cmux
              .closeWorkspace(workspaceId)
              .pipe(
                Effect.catchAll((err) =>
                  Effect.log(`Failed to close workspace: ${err.message}`)
                )
              )
          }

          // Remove git worktree
          yield* git
            .removeWorktree(task.worktreePath, { force: true })
            .pipe(
              Effect.catchAll((err) =>
                Effect.log(`Failed to remove worktree: ${err.message}`)
              )
            )

          // Transition to cleaned_up
          if (
            task.state === "completed" ||
            task.state === "failed" ||
            task.state === "needs_review" ||
            task.state === "running"
          ) {
            yield* taskManager
              .transition(taskId, "completed")
              .pipe(Effect.catchAll(() => Effect.void))
          }
          yield* taskManager
            .transition(taskId, "cleaned_up")
            .pipe(Effect.catchAll(() => Effect.void))

          yield* taskManager.remove(taskId)
          yield* Effect.log(`Task "${task.name}" cleaned up`)
        }),
    }
  })
)

// --- Helpers ---

/** Try to parse an ID from cmux JSON output, or use raw string */
const tryParseId = (raw: string): string => {
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === "object" && parsed !== null) {
      return parsed.id ?? parsed.uuid ?? parsed.ref ?? raw
    }
    return String(parsed)
  } catch {
    return raw.trim()
  }
}
