# Task Lifecycle

## What Is a Task?

A Task is the fundamental unit in pimux. It represents a single agent working session, combining:

- A **git worktree** (isolated working directory on its own branch)
- A **cmux workspace** (terminal workspace with agent + human panes)
- A **pi agent session** (running in the agent pane)
- **Metadata** (id, name, state, timestamps, cmux IDs)

## Task Schema

```typescript
{
  id: string             // Generated ID (base36 timestamp + random)
  name: string           // Human-readable name (e.g., "fix login bug")
  slug: string           // URL-safe slug (e.g., "fix-login-bug")
  state: TaskState       // Current lifecycle state
  branch: string         // Git branch name: "pimux/<slug>"
  worktreePath: string   // Absolute path to git worktree
  cmuxWorkspaceId?: string    // cmux workspace ID (set after creation)
  cmuxAgentSurfaceId?: string // cmux surface ID for the agent pane
  cmuxShellSurfaceId?: string // cmux surface ID for the human shell pane
  createdAt: string      // ISO timestamp
  updatedAt: string      // ISO timestamp
}
```

## State Machine

```
created ──→ setting_up ──→ running ──→ needs_review ──→ completed ──→ cleaned_up
                              │              │
                              │              ↓
                              └──────→   failed ────→ cleaned_up
```

### Valid Transitions

| From | Allowed Transitions |
|------|-------------------|
| `created` | `setting_up`, `failed` |
| `setting_up` | `running`, `failed` |
| `running` | `needs_review`, `completed`, `failed` |
| `needs_review` | `running`, `completed`, `failed` |
| `completed` | `cleaned_up` |
| `failed` | `cleaned_up` |
| `cleaned_up` | _(terminal state)_ |

### State Meanings

| State | Description |
|-------|-------------|
| **created** | Task record created, nothing provisioned yet |
| **setting_up** | Git worktree created, setup hooks running |
| **running** | Agent is active in its cmux workspace |
| **needs_review** | Agent flagged the task for human attention |
| **completed** | Work is done, ready for cleanup |
| **failed** | Something went wrong at any stage |
| **cleaned_up** | Workspace closed, worktree removed, task record deleted |

## Launch Flow

When `pimux tasks new "my-feature"` is run:

1. **Create task record** — TaskManager generates an ID, slug, and persists to `tasks.json`
2. **Create git worktree** — `git worktree add .pimux/worktrees/my-feature -b pimux/my-feature`
3. **Transition → setting_up** — State machine update
4. **Run setup hooks** — Execute commands from `.pimux/config.json` `setup` array in the worktree
5. **Create cmux workspace** — `cmux new-workspace --json` → get workspace ID
6. **Rename workspace** — `cmux rename-workspace "🤖 my-feature"`
7. **Split pane** — `cmux new-pane --direction right` → get shell surface ID
8. **Launch pi** — `cmux send "cd <worktree> && pi"` in the agent pane
9. **Set up human shell** — `cmux send "cd <worktree>"` in the shell pane
10. **Update sidebar** — Set status ("running"), progress (10%), log message
11. **Transition → running** — Save cmux IDs to task record

## Notify Flow

When `pimux tasks notify <id> <message>`:

1. Look up the task by ID
2. Send cmux notification to the workspace
3. Update sidebar status to "needs review" (yellow)
4. Transition task state → `needs_review`

## Review Flow

When `pimux tasks review <id>`:

1. Look up the task
2. Focus the cmux workspace (`cmux select-workspace`)
3. Update sidebar status to "reviewing" (blue)
4. Get `git diff` from the worktree
5. Log "review started" to sidebar
6. Return diff to caller (printed to stdout)

## Close Flow

When `pimux tasks close <id>`:

1. Look up the task
2. Run teardown hooks (from config, errors are caught and logged)
3. Close cmux workspace (errors caught)
4. Remove git worktree with `--force` (errors caught)
5. Transition → `completed` → `cleaned_up`
6. Remove task from registry

The close flow is intentionally resilient — partial failures don't prevent cleanup of remaining resources.

## Persistence

Tasks are stored in `.pimux/tasks.json` at the repo root:

```json
{
  "tasks": [
    {
      "id": "m1abc-xyz123",
      "name": "fix login bug",
      "slug": "fix-login-bug",
      "state": "running",
      "branch": "pimux/fix-login-bug",
      "worktreePath": "/path/to/repo/.pimux/worktrees/fix-login-bug",
      "cmuxWorkspaceId": "ws-abc123",
      "createdAt": "2026-03-02T12:00:00.000Z",
      "updatedAt": "2026-03-02T12:00:05.000Z"
    }
  ]
}
```

Schema validation is done via `Effect.Schema` on both read and write.
