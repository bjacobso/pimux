// ANSI color helpers for branch viewer
// Slim, no deps — just escape codes

const esc = (code: string) => (s: string) => `\x1b[${code}m${s}\x1b[0m`

export const green = esc("32")
export const red = esc("31")
export const yellow = esc("33")
export const blue = esc("34")
export const cyan = esc("36")
export const dim = esc("2")
export const bold = esc("1")
export const italic = esc("3")
export const underline = esc("4")
export const inverse = esc("7")

// Composed
export const accent = cyan
export const muted = dim
export const success = green
export const error = red
export const warning = yellow
export const heading = (s: string) => bold(cyan(s))

// --- Domain helpers ---

export const formatDiffStat = (additions: number, deletions: number): string => {
  const parts: string[] = []
  if (additions > 0) parts.push(green(`+${additions}`))
  if (deletions > 0) parts.push(red(`-${deletions}`))
  return parts.join(" ") || dim("0")
}

export const formatFileStatusIcon = (
  status: string
): string => {
  switch (status) {
    case "added":
      return green("+")
    case "modified":
      return yellow("✎")
    case "deleted":
      return red("-")
    case "renamed":
      return blue("→")
    case "copied":
      return blue("©")
    case "untracked":
      return dim("?")
    default:
      return dim("·")
  }
}

/** Truncate a path for slim display, keeping filename visible */
export const truncatePath = (path: string, maxWidth: number): string => {
  if (path.length <= maxWidth) return path
  const parts = path.split("/")
  if (parts.length <= 1) return path.slice(0, maxWidth - 1) + "…"

  // Keep filename, abbreviate dirs
  const filename = parts[parts.length - 1]
  if (filename.length >= maxWidth - 4) return "…" + filename.slice(-(maxWidth - 1))

  const remaining = maxWidth - filename.length - 1 // -1 for "/"
  const dirPart = parts.slice(0, -1).join("/")
  if (dirPart.length <= remaining) return path

  return "…" + dirPart.slice(-(remaining - 1)) + "/" + filename
}

// --- Section chrome ---

export const sectionHeader = (
  label: string,
  count: number,
  collapsed: boolean,
  selected: boolean
): string => {
  const arrow = collapsed ? "▸" : "▾"
  const prefix = selected ? inverse(` ${arrow} `) : ` ${arrow} `
  return `${prefix} ${bold(label)} ${dim(`(${count})`)}`
}
