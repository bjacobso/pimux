# pimux branch — TUI Branch Viewer

## Context

Build a **slim TUI branch viewer** designed to run in a narrow cmux pane (replacing the right sidebar in tools like Cursor/Superset). Inspired by:

- **Cursor's Changes panel** (Screenshot 1): Staged/Unstaged file groups, +/- diff stats, commit message input, "Publish Branch" button
- **Superset's right sidebar** (Screenshot 2): PR status badge, file changes with diff stats, "Merge" button, tabbed views (Changes/All files/Review)

The tool should be **extensible** (like pi itself) so custom actions can be wired in — e.g., "update PR title/description from all changes" powered by an agent.

## Requirements

### Core (MVP — read-only)
1. **Branch header**: current branch, ahead/behind, remote tracking
2. **File sections** (collapsible):
   - Staged files with `+N -M` diff stats (green/red)
   - Unstaged/modified files
   - Untracked files
3. **Commit list**: recent commits on the branch (short hash + subject)
4. **Keyboard navigation**: vim-style (j/k, enter to collapse/expand, tab between sections)
5. **Slim-friendly**: designed for 30-50 column widths
6. **Auto-refresh**: watches git index for changes

### Future (Phase 2+)
7. **Stage/unstage**: `s`/`u`/`a` actions
8. **PR status**: number, state, reviewers, CI status (GitHub API)
9. **Inline diff preview**: expand a file to see the diff
10. **Commit creation**: write message + commit from the TUI
11. **Extension system**: register custom actions/sections (like pi extensions)
12. **Agent actions**: "Update PR description from changes" button that calls pi

---

## Decisions

- **TUI framework**: `@mariozechner/pi-tui` — MIT, TypeScript, differential rendering, proven
- **Read-only MVP**: no stage/unstage actions, view-only
- **No extension system yet**: hardcoded sections, extensibility later
- **Assumes cmux context**: launched in a cmux pane

---

## Architecture

### New command: `pimux branch`

Runs as a **standalone TUI process** in any terminal. Designed to be launched in a cmux pane via:
```bash
cmux new-pane --direction right --workspace <id>
cmux send --surface <new-pane> "pimux branch"
```

Or just `pimux branch` from any shell.

### Git data layer

All git info gathered by spawning `git` commands (same pattern as `src/Git.ts`):

| Data | Command |
|------|---------|
| Current branch | `git rev-parse --abbrev-ref HEAD` |
| Upstream tracking | `git rev-parse --abbrev-ref @{upstream}` |
| Ahead/behind | `git rev-list --count --left-right @{upstream}...HEAD` |
| Staged files | `git diff --cached --name-status --stat` |
| Unstaged files | `git diff --name-status --stat` |
| Untracked files | `git ls-files --others --exclude-standard` |
| Recent commits | `git log --oneline -20 HEAD --not main` (branch commits) |
| File diff stats | `git diff --numstat` / `git diff --cached --numstat` |

### Component tree

```
┌─────────────────────────────┐
│ BranchViewer (TUI root)     │
├─────────────────────────────┤
│ ┌─ HeaderSection ──────────┐│
│ │ 🌿 feature/my-branch     ││
│ │ ↑2 ↓0 vs origin/main    ││
│ └──────────────────────────┘│
│ ┌─ FileSection (Staged) ───┐│
│ │ ▸ Staged (5)          [-]││
│ │   + src/Cli.ts     +21-11││
│ │   + src/main.ts    +19-30││
│ │   ...                    ││
│ └──────────────────────────┘│
│ ┌─ FileSection (Unstaged) ─┐│
│ │ ▸ Unstaged (3)       [+] ││
│ │   ✎ README.md      +10-2 ││
│ │   ...                    ││
│ └──────────────────────────┘│
│ ┌─ FileSection (Untracked)─┐│
│ │ ▸ Untracked (1)          ││
│ │   ? .env.local           ││
│ └──────────────────────────┘│
│ ┌─ CommitSection ──────────┐│
│ │ ▸ Commits (3)            ││
│ │   a1b2c3 Fix tests       ││
│ │   d4e5f6 Add CLI         ││
│ │   ...                    ││
│ └──────────────────────────┘│
│ ┌─ StatusBar ──────────────┐│
│ │ j/k:nav s:stage u:unstage││
│ └──────────────────────────┘│
└─────────────────────────────┘
```

### Refresh strategy

- **On startup**: full git data fetch
- **File watcher**: watch `.git/index` and `.git/HEAD` for changes → re-fetch
- **Manual**: `r` key to refresh
- **Polling fallback**: every 2 seconds (lightweight `git status --porcelain` check)

---

## Project structure (new files)

```
src/
├── branch/
│   ├── BranchViewer.ts       # Root TUI component + keyboard dispatch
│   ├── GitData.ts            # Service: fetch all git data into a typed model
│   ├── HeaderSection.ts      # Branch name, ahead/behind, tracking
│   ├── FileSection.ts        # Collapsible file list with diff stats
│   ├── CommitSection.ts      # Collapsible commit list
│   ├── StatusBar.ts          # Bottom help bar with keybindings
│   ├── types.ts              # GitBranchData, FileEntry, CommitEntry, etc.
│   └── theme.ts              # Color scheme (ANSI helpers)
├── Cli.ts                    # (updated) Add `branch` subcommand
└── main.ts                   # (updated) Wire branch command
```

---

## Files to create/modify

| File | Action | Purpose |
|------|--------|---------|
| `src/branch/types.ts` | **create** | `GitBranchData`, `FileEntry`, `CommitEntry`, `FileStatus`, `Section` types |
| `src/branch/theme.ts` | **create** | ANSI color helpers: `green()`, `red()`, `dim()`, `bold()`, `accent()` for slim terminals |
| `src/branch/GitData.ts` | **create** | `GitDataService` — fetch branch info, staged/unstaged/untracked files, commits; returns typed `GitBranchData` |
| `src/branch/HeaderSection.ts` | **create** | Component: branch name + ahead/behind + remote tracking |
| `src/branch/FileSection.ts` | **create** | Component: collapsible file group with diff stats, stage/unstage on enter |
| `src/branch/CommitSection.ts` | **create** | Component: collapsible commit list |
| `src/branch/StatusBar.ts` | **create** | Component: bottom help bar |
| `src/branch/BranchViewer.ts` | **create** | Root component: assembles sections, handles global keys (j/k, tab, q, r), manages focus |
| `src/Cli.ts` | **modify** | Add `pimux branch` subcommand |
| `src/main.ts` | **modify** | Wire new command |
| `package.json` | **modify** | Add `@mariozechner/pi-tui` dependency |

---

## Steps

### Phase 1: Git data layer
- [x] 1. `src/branch/types.ts` — Define types:
  - `FileStatus`: `"added" | "modified" | "deleted" | "renamed" | "copied" | "untracked"`
  - `FileEntry`: `{ path, status, additions, deletions, oldPath? }`
  - `CommitEntry`: `{ hash, subject, author, date }`
  - `GitBranchData`: `{ branch, upstream?, ahead, behind, staged: FileEntry[], unstaged: FileEntry[], untracked: string[], commits: CommitEntry[] }`
  - `SectionId`: `"staged" | "unstaged" | "untracked" | "commits"`

- [x] 2. `src/branch/GitData.ts` — `GitDataService`:
  - `fetchBranchData(cwd?)` → `Effect<GitBranchData, GitError>`
  - Uses `Bun.spawn` for each git command, parses output
  - Handles edge cases: no upstream, detached HEAD, empty repo

### Phase 2: TUI components
- [x] 3. `src/branch/theme.ts` — ANSI styling helpers:
  - `green(s)`, `red(s)`, `dim(s)`, `bold(s)`, `accent(s)`, `muted(s)`
  - `formatDiffStat(additions, deletions)` → `"+21 -11"` in green/red
  - `formatFileStatus(status)` → `"+"`, `"✎"`, `"-"`, `"?"` with color
  - `truncatePath(path, width)` — smart path truncation for slim widths

- [x] 4. `src/branch/HeaderSection.ts` (inlined in BranchViewer) — Render:
  - `🌿 branch-name` (accent color)
  - `↑N ↓M vs origin/main` or `(no upstream)` (dim)
  - 2-3 lines total

- [x] 5. `src/branch/FileSection.ts` (inlined in BranchViewer) — Render:
  - Title: `▸ Staged (5)` or `▾ Staged (5)` (collapsible)
  - When expanded: file list with status icon + path + diff stats
  - Files grouped by directory (optional, like Cursor)
  - Keyboard: enter to toggle collapse

- [x] 6. `src/branch/CommitSection.ts` (inlined in BranchViewer) — Render:
  - Title: `▸ Commits (3)` (collapsible)
  - When expanded: `a1b2c3 Fix tests` per line
  - Color: hash in accent, subject in normal

- [x] 7. `src/branch/StatusBar.ts` (inlined in BranchViewer) — Render:
  - `j/k:nav  tab:section  r:refresh  q:quit`
  - Adapts to width (abbreviate if narrow)

- [x] 8. `src/branch/BranchViewer.ts` — Root component:
  - Assembles HeaderSection + FileSections + CommitSection + StatusBar
  - Manages cursor position across sections
  - Global keys: `j`/`k` (navigate), `tab` (next section), `r` (refresh), `q` (quit)
  - Refresh: watches `.git/index` via `fs.watch` + 2s polling fallback
  - Runs TUI lifecycle: `tui.start()`, set focus, render loop

### Phase 3: CLI integration
- [x] 9. Update `src/Cli.ts` — Add `pimux branch` command:
  - `pimux branch` → launches BranchViewer TUI
  - `pimux branch --watch` → (default) auto-refresh on git changes
  - `pimux branch --no-watch` → manual refresh only

- [x] 10. Update `package.json` — Add `@mariozechner/pi-tui` dependency

- [x] 11. Update `src/main.ts` (no changes needed — Cli.ts handles it) — Wire the branch command

### Phase 4: Polish
- [ ] 12. Test in narrow widths (30, 40, 50 cols) — needs interactive terminal
- [ ] 13. Test in cmux pane — needs cmux running
- [x] 14. Add to README

---

## Verification

1. `pimux branch` launches a TUI showing current branch info
2. File sections show staged/unstaged/untracked with correct diff stats
3. `j`/`k` navigates between items, `tab` cycles sections
4. `r` refreshes git data
5. `q` exits cleanly
6. Works in 30-column terminal width
7. Auto-refreshes when files change (git index watcher)
8. `bun build --compile` still produces working binary

---

## Phase 2 (future): Extensibility

The extension system would follow pi's pattern:

```typescript
// .pimux/extensions/pr-updater.ts
export default function(api: BranchViewerAPI) {
  api.registerAction("update-pr", {
    label: "Update PR description",
    section: "header",
    handler: async (ctx) => {
      const diff = await ctx.git.diff()
      // Call pi agent to generate PR description
      const description = await ctx.agent.prompt(
        `Update the PR description based on these changes:\n${diff}`
      )
      await ctx.github.updatePR({ body: description })
    }
  })

  api.registerSection("pr-status", {
    position: "after:header",
    render: async (ctx) => {
      const pr = await ctx.github.getPR()
      return pr
        ? `PR #${pr.number} ${pr.state} — ${pr.title}`
        : "(no PR)"
    }
  })
}
```

This is out of scope for MVP but informs the component architecture (sections as pluggable units).
