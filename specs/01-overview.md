# pimux — Overview

## What It Is

pimux is an agent orchestrator that enables **parallel AI coding agents**, each running in isolated git worktrees with their own terminal workspaces. It combines **cmux** (terminal multiplexer) and **pi** (coding agent) to provide a Superset-like workflow entirely from the terminal.

## Core Idea

A **Task** in pimux is the combination of:

1. **An isolated git worktree** — a separate working copy of the repo on its own branch
2. **A cmux workspace** — a terminal workspace with an agent pane and a human shell pane
3. **A pi agent session** — an AI coding agent running in the agent pane

This lets you run multiple agents in parallel, each working on a different feature/fix without interfering with each other.

## Key Capabilities

- **`pimux tasks new <name>`** — Spin up a new task with a worktree, workspace, and agent in one command
- **`pimux tasks list`** — See all active tasks with their status
- **`pimux tasks notify <id> <msg>`** — Send notifications when an agent needs attention
- **`pimux tasks review <id>`** — Focus a task's workspace and see the git diff
- **`pimux tasks close <id>`** — Tear down everything cleanly (hooks, workspace, worktree)
- **`pimux branch`** — A standalone TUI for viewing git branch status in a slim terminal pane

## Tech Stack

| Component | Technology | Role |
|-----------|-----------|------|
| Runtime | **Bun** | Fast TS runtime, compiles to single binary |
| Core framework | **Effect** | Typed functional programming (services, layers, errors) |
| CLI framework | **@effect/cli** | Command definitions with typed args/options |
| Platform | **@effect/platform-bun** | Process spawning, filesystem, runtime |
| Terminal multiplexer | **cmux** | Workspaces, panes, sidebar, notifications |
| Coding agent | **pi** | AI coding agent launched in cmux panes |
| TUI framework | **@mariozechner/pi-tui** | Terminal UI for branch viewer |

## Design Principles

- **Shell-first integration** — Communicates with cmux and git via CLI commands, not internal APIs
- **Effect-based architecture** — All services are typed Effect services with explicit error channels
- **Isolated by default** — Each task gets its own git branch and worktree
- **Observable** — Task state, progress, and logs visible in cmux sidebar
- **Composable** — Setup/teardown hooks for per-repo customization
