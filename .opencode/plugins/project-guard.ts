// project-guard: project hooks for hotel-mgmt.
//
// - Block accidental edits to build-generated paths (with a clear message explaining the right fix).
// - Cap shell timeouts so a hung build/serve cannot hold the agent.
// - Defensive shell-command guard mirroring the hard deny rules in
//   .opencode/opencode.jsonc (worker merge / master-push / branch-delete
//   denylist).
//
// OpenCode auto-loads files under .opencode/plugins/, so no extra registration is needed.
// Written as a plain object (no imports), like the system plugin, to stay light and reliably loadable.
//
// NOTE: the stack is undecided. GENERATED_SEGMENTS lists common
// build-output directory names; narrow it to the real ones (and extend
// GENERATED_FILES) once the stack is chosen.

// Common build-output directory names across stacks — tighten on stack choice.
const GENERATED_SEGMENTS = ["dist", "build", "out", ".next", "vendor", "node_modules"]
const GENERATED_FILES: string[] = []

function isGeneratedPath(resource: string): boolean {
  if (typeof resource !== "string" || resource.length === 0) return false
  const segments = resource.replace(/\\/g, "/").split("/").filter(Boolean)
  if (segments.length === 0) return false
  if (segments.some((seg) => GENERATED_SEGMENTS.includes(seg))) return true
  return GENERATED_FILES.includes(segments[segments.length - 1])
}

// Defensive shell guard mirroring the hard deny rules in
// .opencode/opencode.jsonc. It uses only the documented
// ctx.permission.hook("evaluate", ...) hook (the same hook as the
// generated-path edit guard below); no other plugin API is assumed.
// Enforcement authority stays with the permission deny rules in
// opencode.jsonc: if this hook ever cannot observe or block a command
// (e.g. a shell invocation shape the evaluate event does not expose),
// the config deny still applies — this hook is defense in depth only.
//
// The guard never blocks: `ao pr merge`, `ao spawn`, `gh pr create`,
// `gh pr view`, `gh pr edit`, git reads, or pushing a session branch.
function shellDenyReason(command: string): string | null {
  if (typeof command !== "string" || command.length === 0) return null
  // Split compound shell lines so `cd x && <denied>` is still caught,
  // while a mere mention of a denied command inside another word is not.
  const segments = command.split(/&&|\|\||[;|\n]/).map((s) => s.trim()).filter(Boolean)
  for (const seg of segments) {
    const cmd = seg.replace(/^\s*(sudo\s+)+/, "")
    // The sanctioned orchestrator/worker paths run through `ao`, never
    // raw `gh`/`git` merges: `ao pr merge` and `ao spawn` are always allowed.
    if (/^ao(\s|$)/.test(cmd)) continue
    // gh allowlist: create/view/edit stay usable from any session.
    if (/^gh\s+pr\s+(create|view|edit)(\s|$)/.test(cmd)) continue
    if (/^gh\s+pr\s+merge(\s|$)/.test(cmd)) {
      return "Merging is the orchestrator's job via script/orchestrator-merge.sh; workers never run `gh pr merge`."
    }
    if (/^gh\s+issue\s+delete(\s|$)/.test(cmd)) {
      return "Deleting GitHub issues is never allowed from an agent session."
    }
    if (/^git\s+push(\s|$)/.test(cmd)) {
      const tokens = cmd.split(/\s+/)
      // tokens[0]=git tokens[1]=push; flags may precede the remote.
      const args = tokens.slice(2)
      if (args.some((t) => t === "-f" || t.startsWith("--force"))) {
        return "Force-push is never allowed; push your session branch with a plain `git push`."
      }
      // Bulk pushes rewrite every ref including the default branch.
      if (args.some((t) => t === "--all" || t === "--mirror" || t.startsWith("--mirror="))) {
        return "Bulk push (`--all`/`--mirror`) is never allowed; push your session branch explicitly."
      }
      // First non-flag token is the remote; the rest are refspecs.
      const nonFlag = args.filter((t) => !t.startsWith("-"))
      const refspecs = nonFlag.length > 0 ? nonFlag.slice(1) : []
      for (const ref of refspecs) {
        // A `+` prefix is a force-push of that refspec.
        if (ref.startsWith("+")) {
          return "Force-push (`+<refspec>`) is never allowed; push your session branch with a plain `git push`."
        }
        // Normalise both sides of `src:dst`: strip `refs/heads/` so
        // `HEAD:refs/heads/master` and `+master` cannot smuggle the
        // default branch past the check.
        const sides = ref.split(":").map((s) => s.replace(/^refs\/heads\//, ""))
        if (sides.some((s) => s === "master")) {
          return "Pushing to the default branch is never allowed; push your session branch and open a PR."
        }
        // Remote branch deletion: `:branch` or (equivalently) `branch:`.
        if (ref.startsWith(":") || (ref.endsWith(":") && ref.length > 1)) {
          return "Remote branch deletion (`git push <remote> :<branch>`) is never allowed."
        }
      }
    }
  }
  return null
}

export default {
  id: "project-guard",
  async setup(ctx: any) {
    // Runs after the permission rules in the config are evaluated, before the action runs.
    // Only narrows allow/ask decisions; keep any deny already present in the config.
    await ctx.permission.hook("evaluate", (event: any) => {
      if (event.action !== "edit") return
      const hit = (event.resources || []).filter(isGeneratedPath)
      if (hit.length === 0) return
      event.effect = "deny"
      event.message =
        "Build-generated path, do not edit by hand: " + hit.join(", ") + ". " +
        "Regenerate it with the stack build command instead (see the hotel-verify skill)."
    })

    // Defensive shell guard: mirror the hard deny rules from
    // .opencode/opencode.jsonc. Only narrows allow/ask decisions; keep
    // any deny already present in the config.
    await ctx.permission.hook("evaluate", (event: any) => {
      if (event.action !== "shell") return
      if (event.effect === "deny") return
      for (const resource of event.resources || []) {
        const reason = shellDenyReason(resource)
        if (reason !== null) {
          event.effect = "deny"
          event.message = reason
          return
        }
      }
    })

    // Avoid hung shells (heavy builds) holding the agent too long.
    await ctx.shell.hook("create.before", (event: any) => {
      const MAX_TIMEOUT_MS = 300000
      if (typeof event.timeout === "number" && event.timeout > MAX_TIMEOUT_MS) {
        event.timeout = MAX_TIMEOUT_MS
      }
    })
  },
}
