# pimux — Superset-like Agent Orchestrator on cmux + pi

## Context

Build **pimux**, an open-source agent orchestrator that recreates the Superset workflow:
- **Parallel agents** in isolated git worktrees
- **Agent monitoring** with status/progress/notifications via cmux sidebar
- **Diff review** when tasks complete
- **Workspace presets** with setup/teardown hooks

Using **cmux** as the terminal/UI layer and **pi** as the default coding agent.

This is a **greenfield TypeScript project** built with **Bun** (compiled to binary) and **Effect** full stack.

### License constraints
- **Superset**: Elastic License 2.0 — learn ideas only, no code copying
- **cmux**: AGPLv3 — communicate via public CLI/socket API only
- **pi**: MIT — SDK or CLI integration

---

## Approach

### Tech stack
- **Bun** runtime + `bun build --compile` for single binary
- **Effect** core for all business logic (typed errors, services, layers)
- **@effect/cli** for CLI command definitions (Args, Options, Command)
- **@effect/platform-bun** for `BunCommandExecutor` (spawning cmux/git), `BunFileSystem`, `BunRuntime`
- **@effect/platform** `Command` module to shell out to `cmux` CLI with `--json` flag
- **@effect/schema** (Effect.Schema) for task state, config, cmux response parsing

### cmux integration strategy
**Phase 1 (MVP): Shell out to `cmux` CLI with `--json`**
- Wrap each cmux command as an Effect using `@effect/platform` `Command.make("cmux", ...args)`
- Parse JSON output with Effect Schema
- Simple, no socket protocol reverse-engineering needed
- cmux sets `CMUX_WORKSPACE_ID`, `CMUX_SURFACE_ID` env vars in panes — we capture these

**Phase 2 (future): Direct Unix socket**
- Use `NodeSocket.makeNet({ path: "/tmp/cmux.sock" })` from `@effect/platform-node-shared`
- Newline-delimited JSON protocol (`{id, method, params}`)

### Agent integration strategy
**Phase 1 (MVP): Terminal-native**
- Launch `pi` inside a cmux pane via `cmux send`
- Monitor via cmux `read-screen` + git status polling
- Use cmux sidebar (`set-status`, `set-progress`, `log`) for dashboard

**Phase 2 (future): SDK/RPC embedded**
- Use pi's RPC mode (`pi --mode rpc --no-session`) as subprocess
- Stream events directly into cmux sidebar

### Task model
A **Task** = git worktree + cmux workspace + agent session

State machine:
```
created → setting_up → running → needs_review → completed → cleaned_up
                                      ↓
                                    failed
```

Persisted as JSON file at `.pimux/tasks.json` in the main repo root.

---

## Project structure

```
pimux/
├── package.json
├── tsconfig.json
├── src/
│   ├── main.ts                  # Bun entry point, wire up layers + run CLI
│   ├── Cli.ts                   # @effect/cli Command definitions
│   ├── Cmux.ts                  # CmuxClient service — shell out to cmux CLI
│   ├── Git.ts                   # Git service — worktree create/remove/list
│   ├── TaskManager.ts           # TaskManager service — CRUD, state machine
│   ├── Workspace.ts             # Workspace service — orchestrate cmux + pi launch
│   ├── Config.ts                # Load .pimux/config.json (setup/teardown hooks)
│   ├── Task.ts                  # Task Schema + TaskState enum
│   └── HookRunner.ts            # Execute setup/teardown shell commands
├── .pimux/
│   └── config.json              # Per-repo hooks example
└── README.md
```

### Service layer design (Effect)

```
┌─────────────────────────────┐
│         Cli.ts              │  @effect/cli Command handlers
├─────────────────────────────┤
│     Workspace.ts            │  Orchestrates task → worktree + cmux + pi
├──────────┬──────────────────┤
│  TaskManager  │  HookRunner │  State machine, persistence │ shell hooks
├──────────┼──────────────────┤
│  Cmux.ts │  Git.ts │ Config │  Low-level services
├──────────┴──────────────────┤
│  @effect/platform-bun       │  Command, FileSystem, Path
└─────────────────────────────┘
```

Each module exports:
- A **Service** (Effect Tag + interface)
- A **Layer** (live implementation)
- **Errors** (tagged Effect errors)

---

## Files to create

| File | Purpose |
|------|---------|
| `package.json` | Bun project, deps: `effect`, `@effect/cli`, `@effect/platform`, `@effect/platform-bun`, `@effect/schema` |
| `tsconfig.json` | Strict TS, ESM, Bun types |
| `src/main.ts` | Entry: compose layers, run CLI via `BunRuntime` |
| `src/Cli.ts` | CLI commands: `pimux tasks new`, `list`, `notify`, `review`, `close` |
| `src/Cmux.ts` | `CmuxClient` service: `createWorkspace`, `closeWorkspace`, `newPane`, `send`, `sendKey`, `readScreen`, `notify`, `setStatus`, `setProgress`, `log`, `sidebarState`, `listWorkspaces` |
| `src/Git.ts` | `GitService`: `createWorktree`, `removeWorktree`, `listWorktrees`, `diff` |
| `src/TaskManager.ts` | `TaskManager` service: `create`, `list`, `get`, `transition`, `remove`; persists to `.pimux/tasks.json` |
| `src/Task.ts` | `Task` Schema, `TaskState` enum, `TaskId` branded type |
| `src/Workspace.ts` | `WorkspaceOrchestrator`: combines TaskManager + Cmux + Git + HookRunner for full task lifecycle |
| `src/Config.ts` | `ConfigService`: loads `.pimux/config.json` with `setup[]` / `teardown[]` |
| `src/HookRunner.ts` | `HookRunner` service: executes shell commands in a worktree cwd |

---

## Reuse

| What | From | How |
|------|------|-----|
| Process spawning | `@effect/platform` `Command.make` + `Command.lines`/`Command.string` | Shell out to `cmux` and `git` |
| CLI framework | `@effect/cli` `Command`, `Args`, `Options` | Define `pimux tasks new/list/notify/review` |
| File I/O | `@effect/platform` `FileSystem` | Read/write tasks.json, config.json |
| Runtime | `@effect/platform-bun` `BunRuntime`, `BunContext` | Provides CommandExecutor, FileSystem, etc. |
| Schema validation | `effect/Schema` | Parse cmux JSON output, task state, config |
| Unix socket (Phase 2) | `@effect/platform-node-shared` `NodeSocket.makeNet({ path })` | Direct cmux socket connection |
| pi agent | `pi` CLI binary | Launched in cmux pane via `cmux send` |

---

## Steps

### Phase 1: Project scaffolding
- [x] 1. Create `package.json` with Bun + Effect dependencies
- [x] 2. Create `tsconfig.json` (strict, ESM, `@effect` paths)
- [x] 3. Create `src/main.ts` entry point skeleton

### Phase 2: Core services
- [x] 4. **`src/Task.ts`** — Define `Task` Schema with fields: `id`, `name`, `slug`, `state`, `branch`, `worktreePath`, `cmuxWorkspaceId`, `createdAt`, `updatedAt`. Define `TaskState` as union: `"created" | "setting_up" | "running" | "needs_review" | "completed" | "cleaned_up" | "failed"`. Define `PimuxConfig` Schema with `setup: string[]`, `teardown: string[]`.
- [x] 5. **`src/Cmux.ts`** — `CmuxClient` service that wraps cmux CLI:
  - `createWorkspace()` → `cmux new-workspace --json` → parse ID
  - `closeWorkspace(id)` → `cmux close-workspace --workspace <id>`
  - `selectWorkspace(id)` → `cmux select-workspace --workspace <id>`
  - `listWorkspaces()` → `cmux list-workspaces --json`
  - `newPane(opts)` → `cmux new-pane --direction <dir> --workspace <id> --json`
  - `send(text, opts)` → `cmux send --workspace <id> --surface <id> "<text>"`
  - `sendKey(key, opts)` → `cmux send-key --workspace <id> --surface <id> "<key>"`
  - `readScreen(opts)` → `cmux read-screen --workspace <id> --surface <id>`
  - `notify(opts)` → `cmux notify --title <t> --body <b> --workspace <id>`
  - `setStatus(key, value, opts)` → `cmux set-status <key> <value> --workspace <id>`
  - `setProgress(value, opts)` → `cmux set-progress <val> --workspace <id>`
  - `log(message, opts)` → `cmux log --workspace <id> -- <message>`
  - `sidebarState(opts)` → `cmux sidebar-state --workspace <id> --json`
  - `renameWorkspace(title, opts)` → `cmux rename-workspace --workspace <id> <title>`
  - Each method: `Command.make("cmux") |> Command.args(...) |> Command.string` piped through Schema decode
- [x] 6. **`src/Git.ts`** — `GitService`:
  - `createWorktree(path, branch)` → `git worktree add <path> -b <branch>`
  - `removeWorktree(path)` → `git worktree remove <path>`
  - `listWorktrees()` → `git worktree list --porcelain` → parse
  - `diff(worktreePath)` → `git -C <path> diff` (for review)
  - `repoRoot()` → `git rev-parse --show-toplevel`
- [x] 7. **`src/Config.ts`** — `ConfigService`:
  - Load `.pimux/config.json` from repo root
  - Schema-validated with `PimuxConfig`
  - Defaults to `{ setup: [], teardown: [] }` if missing
- [x] 8. **`src/HookRunner.ts`** — `HookRunner` service:
  - `runHooks(commands: string[], cwd: string)` — execute each shell command sequentially via `Command.make`
- [x] 9. **`src/TaskManager.ts`** — `TaskManager` service:
  - `create(name)` → generate slug + ID, state = "created", persist
  - `list()` → read tasks.json
  - `get(id)` → lookup
  - `transition(id, newState)` → validate transition, update, persist
  - `remove(id)` → delete from registry
  - Persistence: read/write `.pimux/tasks.json` via `FileSystem`

### Phase 3: Orchestration
- [x] 10. **`src/Workspace.ts`** — `WorkspaceOrchestrator`:
  - `launchTask(name)`:
    1. `TaskManager.create(name)` → task
    2. `Git.createWorktree(.pimux/worktrees/<slug>, <branch>)`
    3. `TaskManager.transition(id, "setting_up")`
    4. `HookRunner.runHooks(config.setup, worktreePath)`
    5. `Cmux.createWorkspace()` → workspaceId
    6. `Cmux.renameWorkspace(name, { workspace: workspaceId })`
    7. `Cmux.newPane({ direction: "right", workspace: workspaceId })` → second pane
    8. `Cmux.send("cd <worktreePath> && pi", { workspace: workspaceId })` → launch pi in first pane
    9. `Cmux.send("cd <worktreePath>", { workspace: workspaceId, surface: secondPane })` → human shell
    10. `Cmux.setStatus("agent", "running", { workspace: workspaceId })`
    11. `Cmux.setProgress(0.1, { label: "Agent started", workspace: workspaceId })`
    12. `Cmux.log("Created worktree, launched pi", { workspace: workspaceId })`
    13. `TaskManager.transition(id, "running")` + save workspaceId
  - `notifyTask(id, message)`:
    1. Get task → workspaceId
    2. `Cmux.notify({ title: message, workspace: workspaceId })`
    3. `Cmux.setStatus("agent", "needs_review")`
  - `reviewTask(id)`:
    1. Get task → workspaceId, worktreePath
    2. `Cmux.selectWorkspace(workspaceId)` — focus the workspace
    3. `Git.diff(worktreePath)` — show diff
  - `closeTask(id)`:
    1. `HookRunner.runHooks(config.teardown, worktreePath)`
    2. `Cmux.closeWorkspace(workspaceId)`
    3. `Git.removeWorktree(worktreePath)`
    4. `TaskManager.transition(id, "cleaned_up")`

### Phase 4: CLI wiring
- [x] 11. **`src/Cli.ts`** — Wire @effect/cli commands:
  - `pimux tasks new <name>` → `WorkspaceOrchestrator.launchTask(name)`
  - `pimux tasks list` → `TaskManager.list()` + `Cmux.sidebarState()` per task → formatted table
  - `pimux tasks notify <id> <message>` → `WorkspaceOrchestrator.notifyTask(id, message)`
  - `pimux tasks review <id>` → `WorkspaceOrchestrator.reviewTask(id)`
  - `pimux tasks close <id>` → `WorkspaceOrchestrator.closeTask(id)`
- [x] 12. **`src/main.ts`** — Compose all layers, run via `BunRuntime.runMain`

### Phase 5: Build + polish
- [x] 13. Add `bun build --compile` script to package.json
- [x] 14. Write README with usage examples
- [x] 15. Add `.pimux/config.json` example with empty setup/teardown

---

## Verification

1. **Build**: `bun build --compile src/main.ts --outfile pimux` succeeds
2. **`pimux tasks new "test-feature"`**:
   - Creates git worktree at `.pimux/worktrees/test-feature`
   - Creates new cmux workspace named "test-feature"
   - Splits into 2 panes (agent + human shell)
   - Launches `pi` in agent pane
   - Shows in cmux sidebar: status "running", progress bar, log entry
3. **`pimux tasks list`**: Shows task with name, state, branch
4. **`pimux tasks notify <id> "needs review"`**: cmux notification pops up, status pill changes
5. **`pimux tasks review <id>`**: Focuses workspace, prints git diff
6. **`pimux tasks close <id>`**: Runs teardown hooks, closes workspace, removes worktree
7. **Error handling**: Missing cmux → clear error; not in git repo → clear error; task not found → clear error
