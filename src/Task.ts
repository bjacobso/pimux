import { Schema } from "effect"

// --- TaskState ---

export const TaskState = Schema.Literal(
  "created",
  "setting_up",
  "running",
  "needs_review",
  "completed",
  "cleaned_up",
  "failed"
)
export type TaskState = typeof TaskState.Type

/** Valid state transitions */
export const validTransitions: Record<TaskState, ReadonlyArray<TaskState>> = {
  created: ["setting_up", "failed"],
  setting_up: ["running", "failed"],
  running: ["needs_review", "completed", "failed"],
  needs_review: ["running", "completed", "failed"],
  completed: ["cleaned_up"],
  cleaned_up: [],
  failed: ["cleaned_up"],
}

// --- Task ---

export class Task extends Schema.Class<Task>("Task")({
  id: Schema.String,
  name: Schema.String,
  slug: Schema.String,
  state: TaskState,
  branch: Schema.String,
  worktreePath: Schema.String,
  cmuxWorkspaceId: Schema.optional(Schema.String),
  cmuxAgentSurfaceId: Schema.optional(Schema.String),
  cmuxShellSurfaceId: Schema.optional(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
}) {}

// --- TaskRegistry (persisted) ---

export class TaskRegistry extends Schema.Class<TaskRegistry>("TaskRegistry")({
  tasks: Schema.Array(Task),
}) {}

// --- PimuxConfig ---

export class PimuxConfig extends Schema.Class<PimuxConfig>("PimuxConfig")({
  setup: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => [],
  }),
  teardown: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => [],
  }),
}) {}

// --- Helpers ---

export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

export const nowISO = (): string => new Date().toISOString()
