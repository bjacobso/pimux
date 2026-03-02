import { Context, Data, Effect, Layer } from "effect"

// --- Errors ---

export class CmuxError extends Data.TaggedError("CmuxError")<{
  readonly command: string
  readonly message: string
  readonly stderr?: string
}> {}

// --- Types ---

export interface CmuxSendOptions {
  readonly workspace?: string
  readonly surface?: string
}

export interface CmuxNotifyOptions {
  readonly workspace?: string
  readonly surface?: string
  readonly subtitle?: string
  readonly body?: string
}

export interface CmuxStatusOptions {
  readonly workspace?: string
  readonly icon?: string
  readonly color?: string
}

export interface CmuxProgressOptions {
  readonly workspace?: string
  readonly label?: string
}

export interface CmuxLogOptions {
  readonly workspace?: string
  readonly level?: string
  readonly source?: string
}

// --- Service definition ---

export class CmuxClient extends Context.Tag("CmuxClient")<
  CmuxClient,
  {
    /** Create a new workspace, returns workspace ref/id */
    readonly createWorkspace: (
      command?: string
    ) => Effect.Effect<string, CmuxError>

    /** Close a workspace */
    readonly closeWorkspace: (
      workspaceId: string
    ) => Effect.Effect<void, CmuxError>

    /** Select/focus a workspace */
    readonly selectWorkspace: (
      workspaceId: string
    ) => Effect.Effect<void, CmuxError>

    /** Rename a workspace */
    readonly renameWorkspace: (
      title: string,
      workspaceId?: string
    ) => Effect.Effect<void, CmuxError>

    /** List all workspaces */
    readonly listWorkspaces: () => Effect.Effect<string, CmuxError>

    /** Create a new pane (split) */
    readonly newPane: (options: {
      readonly direction?: "left" | "right" | "up" | "down"
      readonly workspace?: string
      readonly type?: "terminal" | "browser"
      readonly url?: string
    }) => Effect.Effect<string, CmuxError>

    /** Create a new surface in an existing pane */
    readonly newSurface: (options?: {
      readonly pane?: string
      readonly workspace?: string
      readonly type?: "terminal" | "browser"
      readonly url?: string
    }) => Effect.Effect<string, CmuxError>

    /** Send text to a surface */
    readonly send: (
      text: string,
      options?: CmuxSendOptions
    ) => Effect.Effect<void, CmuxError>

    /** Send a key to a surface */
    readonly sendKey: (
      key: string,
      options?: CmuxSendOptions
    ) => Effect.Effect<void, CmuxError>

    /** Read the screen content of a surface */
    readonly readScreen: (
      options?: CmuxSendOptions & { readonly scrollback?: boolean; readonly lines?: number }
    ) => Effect.Effect<string, CmuxError>

    /** Create a notification */
    readonly notify: (
      title: string,
      options?: CmuxNotifyOptions
    ) => Effect.Effect<void, CmuxError>

    /** Set a status entry in the sidebar */
    readonly setStatus: (
      key: string,
      value: string,
      options?: CmuxStatusOptions
    ) => Effect.Effect<void, CmuxError>

    /** Clear a status entry */
    readonly clearStatus: (
      key: string,
      workspaceId?: string
    ) => Effect.Effect<void, CmuxError>

    /** Set progress bar in sidebar */
    readonly setProgress: (
      value: number,
      options?: CmuxProgressOptions
    ) => Effect.Effect<void, CmuxError>

    /** Clear progress bar */
    readonly clearProgress: (
      workspaceId?: string
    ) => Effect.Effect<void, CmuxError>

    /** Log a message to the sidebar */
    readonly log: (
      message: string,
      options?: CmuxLogOptions
    ) => Effect.Effect<void, CmuxError>

    /** Get sidebar state */
    readonly sidebarState: (
      workspaceId?: string
    ) => Effect.Effect<string, CmuxError>

    /** Identify the current workspace/surface */
    readonly identify: () => Effect.Effect<string, CmuxError>

    /** List panes in a workspace */
    readonly listPanes: (
      workspaceId?: string
    ) => Effect.Effect<string, CmuxError>
  }
>() {}

// --- Helpers ---

const runCmux = (
  args: ReadonlyArray<string>
): Effect.Effect<string, CmuxError> =>
  Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      try: () => {
        const proc = Bun.spawn(["cmux", ...args], {
          stdout: "pipe",
          stderr: "pipe",
        })
        return proc.exited.then(async (exitCode) => {
          const stdout = await new Response(proc.stdout).text()
          const stderr = await new Response(proc.stderr).text()
          return { exitCode, stdout, stderr }
        })
      },
      catch: (err) =>
        new CmuxError({
          command: `cmux ${args.join(" ")}`,
          message: `Failed to spawn cmux: ${err}`,
        }),
    })

    if (result.exitCode !== 0) {
      return yield* new CmuxError({
        command: `cmux ${args.join(" ")}`,
        message: `cmux exited with code ${result.exitCode}`,
        stderr: result.stderr,
      })
    }

    return result.stdout.trim()
  })

const runCmuxVoid = (
  args: ReadonlyArray<string>
): Effect.Effect<void, CmuxError> => runCmux(args).pipe(Effect.asVoid)

// --- Live implementation ---

export const CmuxClientLive = Layer.succeed(CmuxClient, {
  createWorkspace: (command) =>
    runCmux(
      command
        ? ["new-workspace", "--json", "--command", command]
        : ["new-workspace", "--json"]
    ),

  closeWorkspace: (workspaceId) =>
    runCmuxVoid(["close-workspace", "--workspace", workspaceId]),

  selectWorkspace: (workspaceId) =>
    runCmuxVoid(["select-workspace", "--workspace", workspaceId]),

  renameWorkspace: (title, workspaceId) =>
    runCmuxVoid(
      workspaceId
        ? ["rename-workspace", "--workspace", workspaceId, title]
        : ["rename-workspace", title]
    ),

  listWorkspaces: () => runCmux(["list-workspaces", "--json"]),

  newPane: (options) => {
    const args: string[] = ["new-pane", "--json"]
    if (options.direction) args.push("--direction", options.direction)
    if (options.workspace) args.push("--workspace", options.workspace)
    if (options.type) args.push("--type", options.type)
    if (options.url) args.push("--url", options.url)
    return runCmux(args)
  },

  newSurface: (options) => {
    const args: string[] = ["new-surface", "--json"]
    if (options?.pane) args.push("--pane", options.pane)
    if (options?.workspace) args.push("--workspace", options.workspace)
    if (options?.type) args.push("--type", options.type)
    if (options?.url) args.push("--url", options.url)
    return runCmux(args)
  },

  send: (text, options) => {
    const args: string[] = ["send"]
    if (options?.workspace) args.push("--workspace", options.workspace)
    if (options?.surface) args.push("--surface", options.surface)
    args.push(text)
    return runCmuxVoid(args)
  },

  sendKey: (key, options) => {
    const args: string[] = ["send-key"]
    if (options?.workspace) args.push("--workspace", options.workspace)
    if (options?.surface) args.push("--surface", options.surface)
    args.push(key)
    return runCmuxVoid(args)
  },

  readScreen: (options) => {
    const args: string[] = ["read-screen"]
    if (options?.workspace) args.push("--workspace", options.workspace)
    if (options?.surface) args.push("--surface", options.surface)
    if (options?.scrollback) args.push("--scrollback")
    if (options?.lines) args.push("--lines", String(options.lines))
    return runCmux(args)
  },

  notify: (title, options) => {
    const args: string[] = ["notify", "--title", title]
    if (options?.subtitle) args.push("--subtitle", options.subtitle)
    if (options?.body) args.push("--body", options.body)
    if (options?.workspace) args.push("--workspace", options.workspace)
    if (options?.surface) args.push("--surface", options.surface)
    return runCmuxVoid(args)
  },

  setStatus: (key, value, options) => {
    const args: string[] = ["set-status", key, value]
    if (options?.icon) args.push("--icon", options.icon)
    if (options?.color) args.push("--color", options.color)
    if (options?.workspace) args.push("--workspace", options.workspace)
    return runCmuxVoid(args)
  },

  clearStatus: (key, workspaceId) => {
    const args: string[] = ["clear-status", key]
    if (workspaceId) args.push("--workspace", workspaceId)
    return runCmuxVoid(args)
  },

  setProgress: (value, options) => {
    const args: string[] = ["set-progress", String(value)]
    if (options?.label) args.push("--label", options.label)
    if (options?.workspace) args.push("--workspace", options.workspace)
    return runCmuxVoid(args)
  },

  clearProgress: (workspaceId) => {
    const args: string[] = ["clear-progress"]
    if (workspaceId) args.push("--workspace", workspaceId)
    return runCmuxVoid(args)
  },

  log: (message, options) => {
    const args: string[] = ["log"]
    if (options?.level) args.push("--level", options.level)
    if (options?.source) args.push("--source", options.source)
    if (options?.workspace) args.push("--workspace", options.workspace)
    args.push("--", message)
    return runCmuxVoid(args)
  },

  sidebarState: (workspaceId) => {
    const args: string[] = ["sidebar-state", "--json"]
    if (workspaceId) args.push("--workspace", workspaceId)
    return runCmux(args)
  },

  identify: () => runCmux(["identify", "--json"]),

  listPanes: (workspaceId) => {
    const args: string[] = ["list-panes", "--json"]
    if (workspaceId) args.push("--workspace", workspaceId)
    return runCmux(args)
  },
})
