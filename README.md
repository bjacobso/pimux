# pimux

A Superset-like agent orchestrator built on **cmux** + **pi**.

Parallel coding agents, each in their own git worktree and cmux workspace, with status monitoring, notifications, and diff review.

## Quick Start

```bash
bun install
bun run src/main.ts tasks new "my-feature"
```

Or build a standalone binary:

```bash
bun run build
./pimux tasks new "my-feature"
```

## Commands

### `pimux branch`

Launches a TUI branch viewer (designed for a slim cmux side-pane):
- Branch name + ahead/behind upstream
- Staged / Unstaged / Untracked file sections with `+N -M` diff stats
- Commit list for the branch
- Vim-style navigation: `j`/`k` to move, `tab` to switch sections, `enter` to collapse/expand
- Auto-refreshes when git state changes

```bash
# In a cmux pane:
pimux branch

# Or launch in a new right-side pane:
cmux new-pane --direction right
cmux send "pimux branch"
```

### `pimux tasks new <name>`

Creates a new task:
1. Git worktree at `.pimux/worktrees/<slug>` with branch `pimux/<slug>`
2. cmux workspace named `🤖 <name>` with two panes (agent + human shell)
3. Launches `pi` agent in the agent pane
4. Updates cmux sidebar with status, progress, and logs

### `pimux tasks list`

Lists all active tasks with their state, branch, and workspace ID.

### `pimux tasks notify <id> <message>`

Sends a cmux notification for a task and sets status to "needs review".

### `pimux tasks review <id>`

Focuses the task's cmux workspace and shows the git diff.

### `pimux tasks close <id>`

Runs teardown hooks, closes the cmux workspace, removes the git worktree, and cleans up the task.

## Configuration

Create `.pimux/config.json` in your repo root:

```json
{
  "setup": ["bun install", "bun run build"],
  "teardown": ["bun run clean"]
}
```

- **setup**: Shell commands run in the worktree before the agent starts
- **teardown**: Shell commands run before closing a task

## Architecture

```
┌─────────────────────────────┐
│         CLI (Cli.ts)        │  @effect/cli commands
├─────────────────────────────┤
│  WorkspaceOrchestrator      │  Task lifecycle orchestration
├──────────┬──────────────────┤
│TaskManager│   HookRunner    │  State machine │ Shell hooks
├──────────┼──────────────────┤
│ CmuxClient│  GitService     │  cmux CLI wrapper │ git operations
├──────────┴──────────────────┤
│    @effect/platform-bun     │  Process spawning, filesystem
└─────────────────────────────┘
```

### Task State Machine

```
created → setting_up → running → needs_review → completed → cleaned_up
                                      ↓
                                    failed
```

## Tech Stack

- **Bun** — runtime + compile to binary
- **Effect** — typed functional programming (services, layers, errors)
- **@effect/cli** — CLI framework
- **@effect/platform-bun** — Bun runtime layer
- **cmux** — terminal multiplexer (workspaces, panes, sidebar, notifications)
- **pi** — coding agent (launched in cmux panes)

## Dependencies

- **effect** — typed functional programming
- **@effect/cli** — CLI framework
- **@effect/platform-bun** — Bun runtime layer
- **@mariozechner/pi-tui** — TUI framework (from pi-mono)

## Requirements

- [Bun](https://bun.sh) ≥ 1.0
- [cmux](https://cmux.dev) (running, for task orchestration)
- [pi](https://github.com/badlogic/pi-mono) (`npm install -g @mariozechner/pi-coding-agent`)
- Git

## License

MIT
