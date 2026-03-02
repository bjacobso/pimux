# cmux Integration

## Strategy

pimux integrates with cmux by **shelling out to the `cmux` CLI**. Each cmux operation is a `Bun.spawn(["cmux", ...args])` call that captures stdout/stderr and checks the exit code.

This is a deliberate choice over direct socket communication:
- No reverse-engineering of cmux's internal protocol
- Works with any cmux version that has the CLI
- Simple, testable, and debuggable

## CmuxClient Service

The `CmuxClient` service wraps every cmux CLI command pimux needs.

### Workspace Management

| Method | cmux Command | Purpose |
|--------|-------------|---------|
| `createWorkspace(command?)` | `cmux new-workspace --json` | Create a new workspace, returns JSON with ID |
| `closeWorkspace(id)` | `cmux close-workspace --workspace <id>` | Close and destroy a workspace |
| `selectWorkspace(id)` | `cmux select-workspace --workspace <id>` | Focus/switch to a workspace |
| `renameWorkspace(title, id?)` | `cmux rename-workspace [--workspace <id>] <title>` | Set workspace display name |
| `listWorkspaces()` | `cmux list-workspaces --json` | List all workspaces as JSON |

### Pane & Surface Management

| Method | cmux Command | Purpose |
|--------|-------------|---------|
| `newPane(opts)` | `cmux new-pane --json [--direction <dir>] [--workspace <id>]` | Split to create a new pane |
| `newSurface(opts?)` | `cmux new-surface --json [--pane <id>] [--workspace <id>]` | Add a surface to a pane |
| `listPanes(id?)` | `cmux list-panes --json [--workspace <id>]` | List panes in a workspace |

### Terminal Interaction

| Method | cmux Command | Purpose |
|--------|-------------|---------|
| `send(text, opts?)` | `cmux send [--workspace <id>] [--surface <id>] <text>` | Send text/commands to a surface |
| `sendKey(key, opts?)` | `cmux send-key [--workspace <id>] [--surface <id>] <key>` | Send a key event |
| `readScreen(opts?)` | `cmux read-screen [--workspace <id>] [--surface <id>]` | Read terminal screen content |

### Sidebar (Status, Progress, Logs)

| Method | cmux Command | Purpose |
|--------|-------------|---------|
| `setStatus(key, value, opts?)` | `cmux set-status <key> <value> [--icon <i>] [--color <c>]` | Set a status entry in the sidebar |
| `clearStatus(key, id?)` | `cmux clear-status <key>` | Remove a status entry |
| `setProgress(value, opts?)` | `cmux set-progress <value> [--label <l>]` | Set progress bar (0.0–1.0) |
| `clearProgress(id?)` | `cmux clear-progress` | Remove progress bar |
| `log(message, opts?)` | `cmux log [--level <l>] [--source <s>] -- <msg>` | Append a log entry |
| `sidebarState(id?)` | `cmux sidebar-state --json` | Get full sidebar state as JSON |

### Notifications

| Method | cmux Command | Purpose |
|--------|-------------|---------|
| `notify(title, opts?)` | `cmux notify --title <t> [--subtitle <s>] [--body <b>]` | Show a notification |

### Utility

| Method | cmux Command | Purpose |
|--------|-------------|---------|
| `identify()` | `cmux identify --json` | Get current workspace/surface context |

## How pimux Uses cmux

### Task Launch
1. `createWorkspace()` → new workspace for the task
2. `renameWorkspace("🤖 <name>")` → user-friendly name
3. `newPane({ direction: "right" })` → split into agent + shell panes
4. `send("cd <worktree> && pi")` → launch pi agent in the default pane
5. `send("cd <worktree>", { surface: shellId })` → navigate shell pane
6. `setStatus("agent", "running", { icon: "▶", color: "#22c55e" })` → sidebar indicator
7. `setProgress(0.1, { label: "Agent started" })` → progress bar
8. `log("Created worktree, launched pi agent", { source: "pimux" })` → activity log

### Task Notification
1. `notify(message, { workspace: id, subtitle: taskName })` → OS notification
2. `setStatus("agent", "needs review", { icon: "⏸", color: "#eab308" })` → yellow status

### Task Review
1. `selectWorkspace(id)` → focus the workspace
2. `setStatus("agent", "reviewing", { icon: "👀", color: "#3b82f6" })` → blue status

### Task Close
1. `closeWorkspace(id)` → destroy the workspace (errors caught)

## JSON Output Parsing

cmux commands with `--json` return JSON. pimux parses these with a helper function `tryParseId()` that extracts the `.id`, `.uuid`, or `.ref` field from the response, falling back to the raw string.

## Error Handling

All cmux commands can fail with `CmuxError`, which includes:
- `command` — the full command string
- `message` — what went wrong
- `stderr` — captured stderr output

Common failures: cmux not installed, cmux not running, invalid workspace ID.
