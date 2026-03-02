# CLI Specification

## Command Structure

```
pimux
├── tasks
│   ├── new <name>              Create a new task
│   ├── list                    List all active tasks
│   ├── notify <id> <message>   Send notification for a task
│   ├── review <id>             Focus workspace and show diff
│   └── close <id>              Tear down and clean up a task
└── branch                      Launch TUI branch viewer
```

Built with `@effect/cli` (typed `Command`, `Args`, `Options`).

## Commands

### `pimux tasks new <name>`

**Args:** `name` (required, text) — human-readable task name

**Behavior:**
1. Creates git worktree, cmux workspace, launches pi agent
2. Prints task summary (id, name, branch, worktree path, workspace id, state)

**Output (success):**
```
✅ Task created: m1abc-xyz123
   Name:      fix login bug
   Branch:    pimux/fix-login-bug
   Worktree:  /path/to/repo/.pimux/worktrees/fix-login-bug
   Workspace: ws-abc123
   State:     running
```

**Output (error):**
```
❌ Failed to create task: GitError — git exited with code 128
```

---

### `pimux tasks list`

**Args:** none

**Behavior:** Lists all tasks from the registry with their current state.

**Output:**
```
📋 Tasks (2):

     ID            Name                            State           Details
  ──────────────────────────────────────────────────────────────────────────────────────────
  ▶️ m1abc-xyz123  fix login bug                   running         branch:pimux/fix-login-bug  ws:ws-abc123
  ⏸️ m2def-abc456  add dark mode                   needs_review    branch:pimux/add-dark-mode  ws:ws-def456
```

**State emojis:**
| State | Emoji |
|-------|-------|
| created | 📋 |
| setting_up | ⚙️ |
| running | ▶️ |
| needs_review | ⏸️ |
| completed | ✅ |
| cleaned_up | 🗑️ |
| failed | ❌ |

---

### `pimux tasks notify <id> <message>`

**Args:**
- `id` (required, text) — task ID
- `message` (required, text) — notification message

**Behavior:** Sends a cmux notification and updates task status to "needs review".

**Output:**
```
🔔 Notification sent for task m1abc-xyz123: "Please review the login fix"
```

---

### `pimux tasks review <id>`

**Args:** `id` (required, text) — task ID

**Behavior:** Focuses the cmux workspace and prints the git diff.

**Output:**
```
📝 Diff for task m1abc-xyz123:

diff --git a/src/login.ts b/src/login.ts
...
```

---

### `pimux tasks close <id>`

**Args:** `id` (required, text) — task ID

**Behavior:** Runs teardown hooks, closes workspace, removes worktree, cleans up task record.

**Output:**
```
🗑️  Task m1abc-xyz123 closed and cleaned up.
```

---

### `pimux branch`

**Args:** none

**Behavior:** Launches an interactive TUI branch viewer in the current terminal. See [Branch Viewer spec](./06-branch-viewer.md).

## Error Handling

All commands catch errors and display them with the error tag and message:

```
❌ Failed to create task: CmuxError — cmux exited with code 1
```

Errors include the `_tag` (e.g., `GitError`, `CmuxError`, `TaskNotFoundError`) and a descriptive message when available.
