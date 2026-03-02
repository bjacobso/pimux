# Branch Viewer

## Purpose

A **read-only TUI** for viewing git branch status, designed to run in a slim cmux side-pane (30–50 columns). Inspired by Cursor's Changes panel and Superset's sidebar.

Launched via `pimux branch` in any terminal.

## Display Layout

```
┌─────────────────────────────┐
│ 🌿 feature/my-branch        │  Branch header
│ ↑2 ↓0 vs origin/main       │  Tracking info
│                              │
│ ▾ Staged (3)                 │  Collapsible section
│   + src/Cli.ts     +21 -11  │  File with diff stats
│   ✎ src/main.ts   +19 -30  │
│   - old/file.ts     +0 -45  │
│                              │
│ ▾ Unstaged (2)               │
│   ✎ README.md      +10 -2  │
│   ✎ package.json    +1 -1  │
│                              │
│ ▸ Untracked (1)              │  Collapsed
│                              │
│ ▾ Commits (3)                │
│   a1b2c3 Fix tests           │
│   d4e5f6 Add CLI command     │
│   g7h8i9 Initial setup       │
│                              │
│ j/k:nav  tab:section  q:quit │  Status bar
└─────────────────────────────┘
```

## Sections

### Branch Header
- **Branch name** with 🌿 icon, bold cyan
- **Tracking info**: `↑N` (ahead, green) / `↓M` (behind, red) vs upstream branch
- Shows "(no upstream)" in dim if no remote tracking branch

### Staged Files
- Files added to the git index (`git diff --cached`)
- Each shows: status icon + file path + `+N -M` diff stats (green/red)

### Unstaged Files
- Modified tracked files not staged (`git diff`)
- Same format as staged

### Untracked Files
- New files not tracked by git (`git ls-files --others --exclude-standard`)
- Shows `?` icon + file path (no diff stats)
- Only shown if there are untracked files

### Commits
- Recent commits on the current branch vs main/master (`git log --oneline HEAD --not main`)
- Falls back to last 10 commits if no base branch found
- Shows: short hash (cyan) + subject line
- Only shown if there are commits

## Keyboard Navigation

| Key | Action |
|-----|--------|
| `j` / `↓` | Move cursor down (into items, then to next section) |
| `k` / `↑` | Move cursor up |
| `Tab` | Jump to next section header |
| `Shift+Tab` | Jump to previous section header |
| `Enter` / `Space` | Toggle collapse/expand (when on section header) |
| `r` | Manual refresh |
| `q` / `Ctrl+C` | Quit |

### Cursor Model
- Two-level cursor: `cursorSection` (which section) + `cursorItem` (-1 = header, ≥0 = item index)
- `j` from the last item in a section jumps to the next section header
- `k` from a section header goes to the previous section's last item
- Selected items are rendered with inverse video

## Data Fetching

All git data is fetched by spawning git commands:

| Data | Commands |
|------|----------|
| Branch name | `git rev-parse --abbrev-ref HEAD` |
| Upstream | `git rev-parse --abbrev-ref @{upstream}` |
| Ahead/behind | `git rev-list --count --left-right @{upstream}...HEAD` |
| Staged files | `git diff --cached --name-status` + `git diff --cached --numstat` |
| Unstaged files | `git diff --name-status` + `git diff --numstat` |
| Untracked files | `git ls-files --others --exclude-standard` |
| Commits | `git log --oneline -30 HEAD --not main` |

Name-status output is cross-referenced with numstat to get both the file status type and the line-level diff stats.

## Auto-Refresh

Three refresh strategies, all active:

1. **File watcher** — watches `.git/index`, `.git/HEAD`, `.git/FETCH_HEAD` via `fs.watch()`
   - Handles worktrees by reading `.git` file to find the real gitdir
2. **Polling** — every 2 seconds as a fallback
3. **Manual** — `r` key

## Rendering

- Uses `@mariozechner/pi-tui` framework with `ProcessTerminal`
- Implements the `Component` interface with `render(width): string[]`
- Caches rendered lines (invalidated on data change or cursor move)
- Path truncation preserves filename, abbreviates directories for slim widths

## File Status Icons

| Status | Icon | Color |
|--------|------|-------|
| Added | `+` | Green |
| Modified | `✎` | Yellow |
| Deleted | `-` | Red |
| Renamed | `→` | Blue |
| Copied | `©` | Blue |
| Untracked | `?` | Dim |

## Theme

Minimal ANSI color helpers (no dependencies):
- `green`, `red`, `yellow`, `blue`, `cyan`, `dim`, `bold`, `italic`, `inverse`
- Domain helpers: `formatDiffStat()`, `formatFileStatusIcon()`, `truncatePath()`, `sectionHeader()`
