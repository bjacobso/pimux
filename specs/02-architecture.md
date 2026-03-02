# Architecture

## Service Layer Design

pimux is built as a stack of **Effect services**, each with a clear responsibility and explicit dependencies. Services communicate through typed interfaces and are composed via Effect Layers.

```
┌─────────────────────────────────┐
│         CLI (Cli.ts)            │  @effect/cli command handlers
├─────────────────────────────────┤
│   WorkspaceOrchestrator         │  Task lifecycle orchestration
│        (Workspace.ts)           │
├──────────┬──────────────────────┤
│TaskManager│    HookRunner       │  State machine + persistence │ Shell hooks
│           │                     │
├──────────┼──────────────────────┤
│CmuxClient │  GitService │Config │  Low-level service wrappers
├───────────┴─────────────────────┤
│     @effect/platform-bun        │  Process spawning, filesystem
└─────────────────────────────────┘
```

## Services

### Low-Level Services (no dependencies on other pimux services)

| Service | File | Purpose |
|---------|------|---------|
| **CmuxClient** | `Cmux.ts` | Wraps the `cmux` CLI — workspace CRUD, pane management, send/sendKey, sidebar status/progress/logs, notifications |
| **GitService** | `Git.ts` | Wraps `git` CLI — worktree create/remove/list, diff, branch info |
| **HookRunner** | `HookRunner.ts` | Executes shell commands sequentially in a given working directory |

### Mid-Level Services

| Service | File | Depends On | Purpose |
|---------|------|------------|---------|
| **ConfigService** | `Config.ts` | GitService | Loads `.pimux/config.json` from repo root; provides `pimuxDir()` path |
| **TaskManager** | `TaskManager.ts` | ConfigService | CRUD for tasks, state machine transitions, persists to `.pimux/tasks.json` |

### High-Level Services

| Service | File | Depends On | Purpose |
|---------|------|------------|---------|
| **WorkspaceOrchestrator** | `Workspace.ts` | All of the above | Full task lifecycle — launch, notify, review, close |

## Layer Composition

In `main.ts`, layers are composed bottom-up:

```
ConfigLayer = ConfigServiceLive ← GitServiceLive
TaskManagerLayer = TaskManagerLive ← ConfigLayer
OrchestratorLayer = WorkspaceOrchestratorLive ← (Cmux + Git + HookRunner + TaskManager + Config)
AppLayer = merge(Cmux, Git, HookRunner, Config, TaskManager, Orchestrator)
```

The CLI commands are provided the full `AppLayer`, and the whole thing runs via `BunRuntime.runMain`.

## Error Model

Each service defines its own tagged error types:

| Error | Service | Meaning |
|-------|---------|---------|
| `CmuxError` | CmuxClient | cmux command failed (not found, bad args, non-zero exit) |
| `GitError` | GitService | git command failed |
| `HookError` | HookRunner | Setup/teardown hook failed |
| `TaskNotFoundError` | TaskManager | Task ID doesn't exist in registry |
| `InvalidTransitionError` | TaskManager | State machine transition not allowed |
| `TaskPersistenceError` | TaskManager | Failed to read/write tasks.json |

All errors extend `Data.TaggedError` from Effect, giving them a `_tag` discriminator for pattern matching.

## Process Model

pimux shells out to external tools rather than embedding them:

- **cmux** — via `Bun.spawn(["cmux", ...args])` with stdout/stderr capture
- **git** — via `Bun.spawn(["git", ...args])` with optional `cwd`
- **pi** — launched inside a cmux pane via `cmux send "pi"` (not as a subprocess)
- **hooks** — via `Bun.spawn(["sh", "-c", cmd])` in the worktree directory

## File Layout

```
src/
├── main.ts              # Entry point — layer composition, CLI execution
├── Cli.ts               # @effect/cli command definitions
├── Cmux.ts              # CmuxClient service
├── Git.ts               # GitService
├── Task.ts              # Task schema, state enum, helpers
├── TaskManager.ts       # TaskManager service (CRUD + state machine)
├── Workspace.ts         # WorkspaceOrchestrator service
├── Config.ts            # ConfigService
├── HookRunner.ts        # HookRunner service
└── branch/
    ├── BranchViewer.ts  # TUI root component
    ├── GitData.ts       # Git data fetching for branch viewer
    ├── types.ts         # Branch viewer types
    └── theme.ts         # ANSI styling helpers
```
