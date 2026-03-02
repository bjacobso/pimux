import { Context, Data, Effect, Layer, Schema } from "effect"
import { Task, TaskRegistry, type TaskState, slugify, validTransitions, nowISO } from "./Task.js"
import { ConfigService } from "./Config.js"
import * as fs from "node:fs"
import * as nodePath from "node:path"

// --- Errors ---

export class TaskNotFoundError extends Data.TaggedError("TaskNotFoundError")<{
  readonly taskId: string
}> {}

export class InvalidTransitionError extends Data.TaggedError(
  "InvalidTransitionError"
)<{
  readonly taskId: string
  readonly from: TaskState
  readonly to: TaskState
}> {}

export class TaskPersistenceError extends Data.TaggedError(
  "TaskPersistenceError"
)<{
  readonly message: string
}> {}

// --- Service definition ---

export class TaskManager extends Context.Tag("TaskManager")<
  TaskManager,
  {
    /** Create a new task */
    readonly create: (
      name: string,
      worktreePath: string,
      branch: string
    ) => Effect.Effect<Task, TaskPersistenceError>

    /** List all tasks */
    readonly list: () => Effect.Effect<ReadonlyArray<Task>, TaskPersistenceError>

    /** Get a task by ID */
    readonly get: (
      id: string
    ) => Effect.Effect<Task, TaskNotFoundError | TaskPersistenceError>

    /** Transition a task to a new state */
    readonly transition: (
      id: string,
      newState: TaskState
    ) => Effect.Effect<
      Task,
      TaskNotFoundError | InvalidTransitionError | TaskPersistenceError
    >

    /** Update task fields (e.g., cmux workspace ID) */
    readonly update: (
      id: string,
      updates: Partial<{
        cmuxWorkspaceId: string
        cmuxAgentSurfaceId: string
        cmuxShellSurfaceId: string
      }>
    ) => Effect.Effect<Task, TaskNotFoundError | TaskPersistenceError>

    /** Remove a task from the registry */
    readonly remove: (
      id: string
    ) => Effect.Effect<void, TaskNotFoundError | TaskPersistenceError>
  }
>() {}

// --- Helpers ---

const generateId = (): string => {
  const now = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${now}-${rand}`
}

// --- Live implementation ---

export const TaskManagerLive = Layer.effect(
  TaskManager,
  Effect.gen(function* () {
    const config = yield* ConfigService

    const tasksFilePath = Effect.gen(function* () {
      const dir = yield* config.pimuxDir()
      return nodePath.join(dir, "tasks.json")
    })

    const readRegistry: Effect.Effect<TaskRegistry> = Effect.gen(function* () {
      const filePath = yield* tasksFilePath

      try {
        if (!fs.existsSync(filePath)) {
          return new TaskRegistry({ tasks: [] })
        }
        const content = fs.readFileSync(filePath, "utf-8")
        const json = JSON.parse(content)
        return Schema.decodeUnknownSync(TaskRegistry)(json)
      } catch {
        return new TaskRegistry({ tasks: [] })
      }
    })

    const writeRegistry = (
      registry: TaskRegistry
    ): Effect.Effect<void, TaskPersistenceError> =>
      Effect.gen(function* () {
        const filePath = yield* tasksFilePath
        const dir = nodePath.dirname(filePath)

        yield* Effect.try({
          try: () => {
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true })
            }
            const json = Schema.encodeSync(TaskRegistry)(registry)
            fs.writeFileSync(filePath, JSON.stringify(json, null, 2))
          },
          catch: (err) =>
            new TaskPersistenceError({
              message: `Failed to write tasks.json: ${err}`,
            }),
        })
      })

    return {
      create: (name, worktreePath, branch) =>
        Effect.gen(function* () {
          const registry = yield* readRegistry
          const now = nowISO()

          const task = new Task({
            id: generateId(),
            name,
            slug: slugify(name),
            state: "created",
            branch,
            worktreePath,
            createdAt: now,
            updatedAt: now,
          })

          yield* writeRegistry(
            new TaskRegistry({ tasks: [...registry.tasks, task] })
          )
          return task
        }),

      list: () =>
        Effect.gen(function* () {
          const registry = yield* readRegistry
          return registry.tasks
        }),

      get: (id) =>
        Effect.gen(function* () {
          const registry = yield* readRegistry
          const task = registry.tasks.find((t) => t.id === id)
          if (!task) {
            return yield* new TaskNotFoundError({ taskId: id })
          }
          return task
        }),

      transition: (id, newState) =>
        Effect.gen(function* () {
          const registry = yield* readRegistry
          const index = registry.tasks.findIndex((t) => t.id === id)
          if (index === -1) {
            return yield* new TaskNotFoundError({ taskId: id })
          }

          const task = registry.tasks[index]
          const allowed = validTransitions[task.state]
          if (!allowed.includes(newState)) {
            return yield* new InvalidTransitionError({
              taskId: id,
              from: task.state,
              to: newState,
            })
          }

          const updated = new Task({
            ...task,
            state: newState,
            updatedAt: nowISO(),
          })

          const newTasks = [...registry.tasks]
          newTasks[index] = updated
          yield* writeRegistry(new TaskRegistry({ tasks: newTasks }))

          return updated
        }),

      update: (id, updates) =>
        Effect.gen(function* () {
          const registry = yield* readRegistry
          const index = registry.tasks.findIndex((t) => t.id === id)
          if (index === -1) {
            return yield* new TaskNotFoundError({ taskId: id })
          }

          const task = registry.tasks[index]
          const updated = new Task({
            ...task,
            cmuxWorkspaceId: updates.cmuxWorkspaceId ?? task.cmuxWorkspaceId,
            cmuxAgentSurfaceId:
              updates.cmuxAgentSurfaceId ?? task.cmuxAgentSurfaceId,
            cmuxShellSurfaceId:
              updates.cmuxShellSurfaceId ?? task.cmuxShellSurfaceId,
            updatedAt: nowISO(),
          })

          const newTasks = [...registry.tasks]
          newTasks[index] = updated
          yield* writeRegistry(new TaskRegistry({ tasks: newTasks }))

          return updated
        }),

      remove: (id) =>
        Effect.gen(function* () {
          const registry = yield* readRegistry
          const index = registry.tasks.findIndex((t) => t.id === id)
          if (index === -1) {
            return yield* new TaskNotFoundError({ taskId: id })
          }

          const newTasks = registry.tasks.filter((t) => t.id !== id)
          yield* writeRegistry(new TaskRegistry({ tasks: newTasks }))
        }),
    }
  })
)
