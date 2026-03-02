import { Context, Effect, Layer, Schema } from "effect"
import { PimuxConfig } from "./Task.js"
import { GitService } from "./Git.js"
import * as fs from "node:fs"
import * as nodePath from "node:path"

// --- Service definition ---

export class ConfigService extends Context.Tag("ConfigService")<
  ConfigService,
  {
    /** Load the pimux config from the repo root */
    readonly load: () => Effect.Effect<PimuxConfig>

    /** Get the pimux directory path (.pimux/) */
    readonly pimuxDir: () => Effect.Effect<string>
  }
>() {}

// --- Live implementation ---

const defaultConfig = new PimuxConfig({ setup: [], teardown: [] })

export const ConfigServiceLive = Layer.effect(
  ConfigService,
  Effect.gen(function* () {
    const git = yield* GitService

    const getRoot = git.repoRoot().pipe(
      Effect.catchAll(() => Effect.succeed(process.cwd()))
    )

    return {
      load: () =>
        Effect.gen(function* () {
          const root = yield* getRoot
          const configPath = nodePath.join(root, ".pimux", "config.json")

          try {
            const content = fs.readFileSync(configPath, "utf-8")
            const json = JSON.parse(content)
            return Schema.decodeUnknownSync(PimuxConfig)(json)
          } catch {
            return defaultConfig
          }
        }),

      pimuxDir: () =>
        Effect.gen(function* () {
          const root = yield* getRoot
          return nodePath.join(root, ".pimux")
        }),
    }
  })
)
