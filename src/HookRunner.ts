import { Context, Data, Effect, Layer } from "effect"

// --- Errors ---

export class HookError extends Data.TaggedError("HookError")<{
  readonly hook: string
  readonly message: string
  readonly stderr?: string
}> {}

// --- Service definition ---

export class HookRunner extends Context.Tag("HookRunner")<
  HookRunner,
  {
    /** Run a list of shell commands sequentially in the given cwd */
    readonly runHooks: (
      commands: ReadonlyArray<string>,
      cwd: string
    ) => Effect.Effect<void, HookError>
  }
>() {}

// --- Live implementation ---

export const HookRunnerLive = Layer.succeed(HookRunner, {
  runHooks: (commands, cwd) =>
    Effect.gen(function* () {
      for (const cmd of commands) {
        yield* Effect.tryPromise({
          try: () => {
            const proc = Bun.spawn(["sh", "-c", cmd], {
              stdout: "pipe",
              stderr: "pipe",
              cwd,
            })
            return proc.exited.then(async (exitCode) => {
              const stderr = await new Response(proc.stderr).text()
              if (exitCode !== 0) {
                throw new HookError({
                  hook: cmd,
                  message: `Hook exited with code ${exitCode}`,
                  stderr,
                })
              }
            })
          },
          catch: (err) => {
            if (err instanceof HookError) return err
            return new HookError({
              hook: cmd,
              message: `Failed to run hook: ${err}`,
            })
          },
        })

        yield* Effect.log(`Hook completed: ${cmd}`)
      }
    }),
})
