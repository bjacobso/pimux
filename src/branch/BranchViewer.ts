import {
  TUI,
  type Component,
  Container,
  ProcessTerminal,
  matchesKey,
  Key,
  truncateToWidth,
} from "@mariozechner/pi-tui"
import type { GitBranchData, SectionId } from "./types.js"
import { fetchBranchData } from "./GitData.js"
import * as t from "./theme.js"
import * as fs from "node:fs"
import * as path from "node:path"

// --- Section model ---

interface Section {
  id: SectionId
  collapsed: boolean
  itemCount: number
}

// --- BranchViewer component ---

export class BranchViewer implements Component {
  private data: GitBranchData | null = null
  private sections: Section[] = []
  private cursorSection = 0 // which section is focused
  private cursorItem = -1 // -1 = section header, >=0 = item within section
  private scrollOffset = 0
  private cachedWidth?: number
  private cachedLines?: string[]
  private cwd: string
  private tui: TUI | null = null
  private watcher: fs.FSWatcher | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private lastDataHash = ""

  constructor(cwd: string) {
    this.cwd = cwd
  }

  // --- Data ---

  async refresh(): Promise<void> {
    this.data = await fetchBranchData(this.cwd)
    this.sections = this.buildSections()
    this.invalidate()
    this.tui?.requestRender()
  }

  private buildSections(): Section[] {
    if (!this.data) return []
    const s: Section[] = []
    s.push({ id: "staged", collapsed: false, itemCount: this.data.staged.length })
    s.push({ id: "unstaged", collapsed: false, itemCount: this.data.unstaged.length })
    if (this.data.untracked.length > 0) {
      s.push({ id: "untracked", collapsed: false, itemCount: this.data.untracked.length })
    }
    if (this.data.commits.length > 0) {
      s.push({ id: "commits", collapsed: false, itemCount: this.data.commits.length })
    }
    return s
  }

  // --- Lifecycle ---

  async start(): Promise<void> {
    const terminal = new ProcessTerminal()
    this.tui = new TUI(terminal, false)
    this.tui.addChild(this)
    this.tui.setFocus(this)

    await this.refresh()

    this.tui.start()
    this.tui.requestRender(true)

    // Watch git index for changes
    this.startWatching()
  }

  stop(): void {
    this.watcher?.close()
    this.watcher = null
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    this.tui?.stop()
  }

  private startWatching(): void {
    // Watch .git directory for index changes
    const gitDir = path.join(this.cwd, ".git")
    try {
      // If .git is a file (worktree), read the actual gitdir
      const stat = fs.statSync(gitDir)
      let watchPath: string
      if (stat.isFile()) {
        const content = fs.readFileSync(gitDir, "utf-8").trim()
        const match = content.match(/^gitdir:\s*(.+)$/)
        watchPath = match ? match[1] : gitDir
      } else {
        watchPath = gitDir
      }

      this.watcher = fs.watch(watchPath, { recursive: false }, (_event, filename) => {
        if (filename === "index" || filename === "HEAD" || filename === "FETCH_HEAD") {
          this.refresh()
        }
      })
      this.watcher.on("error", () => {}) // swallow
    } catch {
      // fallback: poll
    }

    // Polling fallback: check every 2s
    this.pollTimer = setInterval(() => this.refresh(), 2000)
  }

  // --- Keyboard ---

  handleInput(data: string): void {
    if (matchesKey(data, "q") || matchesKey(data, Key.ctrl("c"))) {
      this.stop()
      process.exit(0)
    }

    if (matchesKey(data, "r")) {
      this.refresh()
      return
    }

    if (matchesKey(data, "j") || matchesKey(data, Key.down)) {
      this.moveDown()
      return
    }

    if (matchesKey(data, "k") || matchesKey(data, Key.up)) {
      this.moveUp()
      return
    }

    if (matchesKey(data, Key.tab)) {
      this.nextSection()
      return
    }

    if (matchesKey(data, Key.shift("tab"))) {
      this.prevSection()
      return
    }

    if (matchesKey(data, Key.enter) || matchesKey(data, Key.space)) {
      this.toggleCollapse()
      return
    }
  }

  private moveDown(): void {
    const sec = this.sections[this.cursorSection]
    if (!sec) return

    if (this.cursorItem === -1) {
      // On section header
      if (!sec.collapsed && sec.itemCount > 0) {
        this.cursorItem = 0
      } else {
        this.nextSection()
      }
    } else if (this.cursorItem < sec.itemCount - 1) {
      this.cursorItem++
    } else {
      this.nextSection()
    }
    this.invalidate()
    this.tui?.requestRender()
  }

  private moveUp(): void {
    if (this.cursorItem > 0) {
      this.cursorItem--
    } else if (this.cursorItem === 0) {
      this.cursorItem = -1
    } else {
      // On header, go to prev section's last item
      if (this.cursorSection > 0) {
        this.cursorSection--
        const prev = this.sections[this.cursorSection]
        if (prev && !prev.collapsed && prev.itemCount > 0) {
          this.cursorItem = prev.itemCount - 1
        } else {
          this.cursorItem = -1
        }
      }
    }
    this.invalidate()
    this.tui?.requestRender()
  }

  private nextSection(): void {
    if (this.cursorSection < this.sections.length - 1) {
      this.cursorSection++
      this.cursorItem = -1
    }
    this.invalidate()
    this.tui?.requestRender()
  }

  private prevSection(): void {
    if (this.cursorSection > 0) {
      this.cursorSection--
      this.cursorItem = -1
    }
    this.invalidate()
    this.tui?.requestRender()
  }

  private toggleCollapse(): void {
    const sec = this.sections[this.cursorSection]
    if (!sec || this.cursorItem !== -1) return
    sec.collapsed = !sec.collapsed
    this.invalidate()
    this.tui?.requestRender()
  }

  // --- Render ---

  invalidate(): void {
    this.cachedWidth = undefined
    this.cachedLines = undefined
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines
    }

    const lines: string[] = []

    if (!this.data) {
      lines.push(truncateToWidth(t.dim(" Loading..."), width))
      this.cachedWidth = width
      this.cachedLines = lines
      return lines
    }

    // --- Header ---
    lines.push(truncateToWidth(` ${t.heading("🌿 " + this.data.branch)}`, width))

    if (this.data.upstream) {
      const parts: string[] = []
      if (this.data.ahead > 0) parts.push(t.green(`↑${this.data.ahead}`))
      if (this.data.behind > 0) parts.push(t.red(`↓${this.data.behind}`))
      const tracking = parts.length > 0
        ? parts.join(" ") + " " + t.dim(`vs ${this.data.upstream}`)
        : t.dim(`in sync with ${this.data.upstream}`)
      lines.push(truncateToWidth(` ${tracking}`, width))
    } else {
      lines.push(truncateToWidth(` ${t.dim("(no upstream)")}`, width))
    }
    lines.push("") // spacer

    // --- Sections ---
    for (let si = 0; si < this.sections.length; si++) {
      const sec = this.sections[si]
      const isSelectedSection = si === this.cursorSection

      // Section header
      const headerLabel = this.sectionLabel(sec.id)
      const headerLine = t.sectionHeader(
        headerLabel,
        sec.itemCount,
        sec.collapsed,
        isSelectedSection && this.cursorItem === -1
      )
      lines.push(truncateToWidth(headerLine, width))

      // Section items
      if (!sec.collapsed) {
        const items = this.sectionItems(sec.id, width, isSelectedSection)
        lines.push(...items)
      }

      lines.push("") // spacer between sections
    }

    // --- Status bar ---
    const statusKeys = [
      "j/k:nav",
      "tab:section",
      "enter:expand",
      "r:refresh",
      "q:quit",
    ]
    // Fit to width
    let statusLine = " " + statusKeys.join("  ")
    if (statusLine.length > width) {
      statusLine = " j/k tab enter r q"
    }
    lines.push(truncateToWidth(t.dim(statusLine), width))

    this.cachedWidth = width
    this.cachedLines = lines
    return lines
  }

  private sectionLabel(id: SectionId): string {
    switch (id) {
      case "staged": return "Staged"
      case "unstaged": return "Unstaged"
      case "untracked": return "Untracked"
      case "commits": return "Commits"
    }
  }

  private sectionItems(
    id: SectionId,
    width: number,
    isSelectedSection: boolean
  ): string[] {
    const lines: string[] = []

    switch (id) {
      case "staged":
        for (let i = 0; i < this.data!.staged.length; i++) {
          const f = this.data!.staged[i]
          const selected = isSelectedSection && this.cursorItem === i
          lines.push(this.renderFileEntry(f, width, selected))
        }
        break

      case "unstaged":
        for (let i = 0; i < this.data!.unstaged.length; i++) {
          const f = this.data!.unstaged[i]
          const selected = isSelectedSection && this.cursorItem === i
          lines.push(this.renderFileEntry(f, width, selected))
        }
        break

      case "untracked":
        for (let i = 0; i < this.data!.untracked.length; i++) {
          const p = this.data!.untracked[i]
          const selected = isSelectedSection && this.cursorItem === i
          const prefix = selected ? t.inverse("   ") : "   "
          lines.push(truncateToWidth(
            `${prefix} ${t.formatFileStatusIcon("untracked")} ${t.truncatePath(p, width - 8)}`,
            width
          ))
        }
        break

      case "commits":
        for (let i = 0; i < this.data!.commits.length; i++) {
          const c = this.data!.commits[i]
          const selected = isSelectedSection && this.cursorItem === i
          const prefix = selected ? t.inverse("   ") : "   "
          const hash = t.accent(c.hash)
          const subject = t.truncatePath(c.subject, width - c.hash.length - 8)
          lines.push(truncateToWidth(`${prefix} ${hash} ${subject}`, width))
        }
        break
    }

    if (lines.length === 0) {
      lines.push(truncateToWidth(`   ${t.dim("(empty)")}`, width))
    }

    return lines
  }

  private renderFileEntry(
    f: { path: string; status: string; additions: number; deletions: number },
    width: number,
    selected: boolean
  ): string {
    const icon = t.formatFileStatusIcon(f.status)
    const stat = t.formatDiffStat(f.additions, f.deletions)
    const prefix = selected ? t.inverse("   ") : "   "
    // Reserve space for icon(2) + stat(~12) + padding(6)
    const pathWidth = Math.max(10, width - 22)
    const filePath = t.truncatePath(f.path, pathWidth)
    return truncateToWidth(`${prefix} ${icon} ${filePath} ${stat}`, width)
  }
}

// --- Entry point ---

export const runBranchViewer = async (cwd: string): Promise<void> => {
  const viewer = new BranchViewer(cwd)
  await viewer.start()

  // Keep alive
  await new Promise<void>(() => {})
}
