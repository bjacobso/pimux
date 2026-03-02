import { Args, Command, Options } from "@effect/cli"
import { Console, Effect } from "effect"
import { TaskManager } from "./TaskManager.js"
import { WorkspaceOrchestrator } from "./Workspace.js"
import { runBranchViewer } from "./branch/BranchViewer.js"
import type { Task } from "./Task.js"

// ── Helpers ──────────────────────────────────────────────────

const formatTask = (task: Task): string => {
  const stateEmoji: Record<string, string> = {
    created: "📋",
    setting_up: "⚙️",
    running: "▶️",
    needs_review: "⏸️",
    completed: "✅",
    cleaned_up: "🗑️",
    failed: "❌",
  }
  const emoji = stateEmoji[task.state] ?? "❓"
  const wsId = task.cmuxWorkspaceId ?? "-"
  return `  ${emoji} ${task.id}  ${task.name.padEnd(30)}  ${task.state.padEnd(14)}  branch:${task.branch}  ws:${wsId}`
}

// ── Commands ─────────────────────────────────────────────────

// pimux tasks new <name>
const tasksNew = Command.make(
  "new",
  { name: Args.text({ name: "name" }) },
  ({ name }) =>
    Effect.gen(function* () {
      const orchestrator = yield* WorkspaceOrchestrator
      const task = yield* orchestrator.launchTask(name)
      yield* Console.log(`\n✅ Task created: ${task.id}`)
      yield* Console.log(`   Name:      ${task.name}`)
      yield* Console.log(`   Branch:    ${task.branch}`)
      yield* Console.log(`   Worktree:  ${task.worktreePath}`)
      yield* Console.log(
        `   Workspace: ${task.cmuxWorkspaceId ?? "-"}`
      )
      yield* Console.log(`   State:     ${task.state}\n`)
    }).pipe(
      Effect.catchAll((err) =>
        Console.error(
          `\n❌ Failed to create task: ${err._tag} — ${"message" in err ? (err as any).message : JSON.stringify(err)}`
        )
      )
    )
)

// pimux tasks list
const tasksList = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const taskManager = yield* TaskManager
    const tasks = yield* taskManager.list()

    if (tasks.length === 0) {
      yield* Console.log("\nNo active tasks.\n")
      return
    }

    yield* Console.log(`\n📋 Tasks (${tasks.length}):\n`)
    yield* Console.log(
      `  ${"".padEnd(2)} ${"ID".padEnd(12)}  ${"Name".padEnd(30)}  ${"State".padEnd(14)}  Details`
    )
    yield* Console.log(`  ${"─".repeat(90)}`)
    for (const task of tasks) {
      yield* Console.log(formatTask(task))
    }
    yield* Console.log("")
  }).pipe(
    Effect.catchAll((err) =>
      Console.error(`\n❌ Failed to list tasks: ${err._tag}`)
    )
  )
)

// pimux tasks notify <id> <message>
const tasksNotify = Command.make(
  "notify",
  {
    id: Args.text({ name: "id" }),
    message: Args.text({ name: "message" }),
  },
  ({ id, message }) =>
    Effect.gen(function* () {
      const orchestrator = yield* WorkspaceOrchestrator
      yield* orchestrator.notifyTask(id, message)
      yield* Console.log(
        `\n🔔 Notification sent for task ${id}: "${message}"\n`
      )
    }).pipe(
      Effect.catchAll((err) =>
        Console.error(
          `\n❌ Failed to notify: ${err._tag} — ${"message" in err ? (err as any).message : "taskId" in err ? `task ${(err as any).taskId} not found` : JSON.stringify(err)}`
        )
      )
    )
)

// pimux tasks review <id>
const tasksReview = Command.make(
  "review",
  { id: Args.text({ name: "id" }) },
  ({ id }) =>
    Effect.gen(function* () {
      const orchestrator = yield* WorkspaceOrchestrator
      const diff = yield* orchestrator.reviewTask(id)
      yield* Console.log(`\n📝 Diff for task ${id}:\n`)
      yield* Console.log(diff)
      yield* Console.log("")
    }).pipe(
      Effect.catchAll((err) =>
        Console.error(
          `\n❌ Failed to review: ${err._tag} — ${"message" in err ? (err as any).message : "taskId" in err ? `task ${(err as any).taskId} not found` : JSON.stringify(err)}`
        )
      )
    )
)

// pimux tasks close <id>
const tasksClose = Command.make(
  "close",
  { id: Args.text({ name: "id" }) },
  ({ id }) =>
    Effect.gen(function* () {
      const orchestrator = yield* WorkspaceOrchestrator
      yield* orchestrator.closeTask(id)
      yield* Console.log(`\n🗑️  Task ${id} closed and cleaned up.\n`)
    }).pipe(
      Effect.catchAll((err) =>
        Console.error(
          `\n❌ Failed to close: ${err._tag} — ${"message" in err ? (err as any).message : "taskId" in err ? `task ${(err as any).taskId} not found` : JSON.stringify(err)}`
        )
      )
    )
)

// pimux tasks (parent command with subcommands)
const tasks = Command.make("tasks").pipe(
  Command.withSubcommands([
    tasksNew,
    tasksList,
    tasksNotify,
    tasksReview,
    tasksClose,
  ])
)

// pimux branch — TUI branch viewer
const branch = Command.make("branch", {}, () =>
  Effect.gen(function* () {
    yield* Effect.promise(() => runBranchViewer(process.cwd()))
  }).pipe(
    Effect.catchAll((err) =>
      Console.error(`\n❌ Branch viewer error: ${err}`)
    )
  )
)

// pimux (root command with subcommands)
export const pimuxCommand = Command.make("pimux").pipe(
  Command.withSubcommands([tasks, branch])
)
