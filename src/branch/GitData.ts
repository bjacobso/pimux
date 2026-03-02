import type {
  CommitEntry,
  FileEntry,
  FileStatus,
  GitBranchData,
} from "./types.js"

// --- Helpers ---

const run = async (
  args: string[],
  cwd?: string
): Promise<{ stdout: string; ok: boolean }> => {
  const proc = Bun.spawn(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    cwd,
  })
  const exitCode = await proc.exited
  const stdout = await new Response(proc.stdout).text()
  return { stdout: stdout.trim(), ok: exitCode === 0 }
}

const statusChar = (c: string): FileStatus => {
  switch (c) {
    case "A":
      return "added"
    case "M":
      return "modified"
    case "D":
      return "deleted"
    case "R":
      return "renamed"
    case "C":
      return "copied"
    default:
      return "modified"
  }
}

// --- Parse numstat output ---
// "10\t5\tpath" or "10\t5\told => new" for renames

const parseNumstat = (
  lines: string[],
  nameStatusMap: Map<string, FileStatus>
): FileEntry[] => {
  const entries: FileEntry[] = []
  for (const line of lines) {
    if (!line) continue
    const parts = line.split("\t")
    if (parts.length < 3) continue
    const additions = parts[0] === "-" ? 0 : parseInt(parts[0], 10) || 0
    const deletions = parts[1] === "-" ? 0 : parseInt(parts[1], 10) || 0
    const path = parts.slice(2).join("\t")

    // Handle renames: "old => new" or "{old => new}/path"
    const renameMatch = path.match(/^(.+?)\{(.+?) => (.+?)\}(.*)$/)
    let resolvedPath = path
    let oldPath: string | undefined
    if (renameMatch) {
      const [, prefix, old, newPart, suffix] = renameMatch
      resolvedPath = `${prefix}${newPart}${suffix}`
      oldPath = `${prefix}${old}${suffix}`
    } else if (path.includes(" => ")) {
      const [old, newP] = path.split(" => ")
      resolvedPath = newP
      oldPath = old
    }

    const status = nameStatusMap.get(resolvedPath) ?? "modified"
    entries.push({ path: resolvedPath, status, additions, deletions, oldPath })
  }
  return entries
}

// --- Parse name-status output ---
// "M\tpath" or "R100\told\tnew"

const parseNameStatus = (output: string): Map<string, FileStatus> => {
  const map = new Map<string, FileStatus>()
  for (const line of output.split("\n")) {
    if (!line) continue
    const parts = line.split("\t")
    const statusCode = parts[0]?.[0] ?? "M"
    const path = parts.length >= 3 ? parts[2] : parts[1]
    if (path) {
      map.set(path, statusChar(statusCode))
    }
  }
  return map
}

// --- Main fetch ---

export const fetchBranchData = async (
  cwd?: string
): Promise<GitBranchData> => {
  // Branch name
  const branchResult = await run(
    ["rev-parse", "--abbrev-ref", "HEAD"],
    cwd
  )
  const branch = branchResult.ok ? branchResult.stdout : "HEAD (detached)"

  // Upstream
  const upstreamResult = await run(
    ["rev-parse", "--abbrev-ref", "@{upstream}"],
    cwd
  )
  const upstream = upstreamResult.ok ? upstreamResult.stdout : null

  // Ahead/behind
  let ahead = 0
  let behind = 0
  if (upstream) {
    const abResult = await run(
      ["rev-list", "--count", "--left-right", `${upstream}...HEAD`],
      cwd
    )
    if (abResult.ok) {
      const parts = abResult.stdout.split("\t")
      behind = parseInt(parts[0], 10) || 0
      ahead = parseInt(parts[1], 10) || 0
    }
  }

  // Staged: name-status + numstat
  const stagedNS = await run(["diff", "--cached", "--name-status"], cwd)
  const stagedNumstat = await run(["diff", "--cached", "--numstat"], cwd)
  const stagedStatusMap = parseNameStatus(stagedNS.stdout)
  const staged = parseNumstat(
    stagedNumstat.stdout.split("\n"),
    stagedStatusMap
  )

  // Unstaged: name-status + numstat
  const unstagedNS = await run(["diff", "--name-status"], cwd)
  const unstagedNumstat = await run(["diff", "--numstat"], cwd)
  const unstagedStatusMap = parseNameStatus(unstagedNS.stdout)
  const unstaged = parseNumstat(
    unstagedNumstat.stdout.split("\n"),
    unstagedStatusMap
  )

  // Untracked
  const untrackedResult = await run(
    ["ls-files", "--others", "--exclude-standard"],
    cwd
  )
  const untracked = untrackedResult.ok
    ? untrackedResult.stdout.split("\n").filter(Boolean)
    : []

  // Commits on branch (vs main/master)
  let commits: CommitEntry[] = []
  // Try to find base branch
  for (const base of ["main", "master"]) {
    const logResult = await run(
      [
        "log",
        "--oneline",
        "-30",
        `HEAD`,
        "--not",
        base,
        "--",
      ],
      cwd
    )
    if (logResult.ok && logResult.stdout) {
      commits = logResult.stdout.split("\n").filter(Boolean).map((line) => {
        const spaceIdx = line.indexOf(" ")
        return {
          hash: line.slice(0, spaceIdx),
          subject: line.slice(spaceIdx + 1),
        }
      })
      break
    }
  }

  // Fallback: last 10 commits if no base found
  if (commits.length === 0) {
    const logResult = await run(
      ["log", "--oneline", "-10"],
      cwd
    )
    if (logResult.ok && logResult.stdout) {
      commits = logResult.stdout.split("\n").filter(Boolean).map((line) => {
        const spaceIdx = line.indexOf(" ")
        return {
          hash: line.slice(0, spaceIdx),
          subject: line.slice(spaceIdx + 1),
        }
      })
    }
  }

  return { branch, upstream, ahead, behind, staged, unstaged, untracked, commits }
}
