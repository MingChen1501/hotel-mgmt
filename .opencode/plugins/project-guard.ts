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
// Stack decided per ADR-0001 (monorepo polyglot, accepted 2026-10-23).
// GENERATED_SEGMENTS lists only the build-output directories the real
// stacks produce: the Node.js/TypeScript services emit `dist/` (tsc)
// beside `node_modules/`; Java Spring Boot (Maven) emits `target/`; Go
// builds to /server inside Docker while `go build ./...` discards its
// output, so Go contributes no repo-local segment. GENERATED_FILES
// stays empty: no stack emits a fixed-name generated file worth
// blocking (it matches exact basenames only). Re-extend either list
// only when a stack starts emitting a new path.

// Build-output directory names for the decided stacks (see NOTE above).
const GENERATED_SEGMENTS = ["dist", "node_modules", "target"]
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
// The guard defers on most `ao ...` commands (config owns those), but
// denies direct session control here too: the config rules match the
// whole tool-call string, so a compound command such as
// `true; ao pr merge 19` or `cd x && ao spawn ...` slips past them.
// The sanctioned scripts invoke the CLI as a child process (their tool
// calls are `script/...` strings), so denying these segments cannot
// disturb them.
function aoDenyReason(cmd: string): string | null {
  if (/^ao\s+spawn(\s|$)/.test(cmd)) {
    return "Only the orchestrator may spawn sessions, via script/ao-spawn-worker.sh."
  }
  if (/^ao\s+pr\s+merge(\s|$)/.test(cmd)) {
    return "Only the orchestrator may merge, via script/orchestrator-merge.sh."
  }
  if (/^ao\s+review\s+trigger(\s|$)/.test(cmd)) {
    return "Only the orchestrator may trigger reviews, via script/orchestrator-review.sh."
  }
  return null
}
function shellDenyReason(command: string): string | null {
  if (typeof command !== "string" || command.length === 0) return null
  // Split compound shell lines so `cd x && <denied>` is still caught,
  // while a mere mention of a denied command inside another word is not.
  // Bare `&` splits too (backgrounding still runs the command); segment
  // matching stays anchored so `2>&1` redirections are harmless.
  const segments = command.split(/&&?|\|\|?|[;\n]/).map((s) => s.trim()).filter(Boolean)
  for (const seg of segments) {
    const cmd = seg.replace(/^\s*(sudo\s+)+/, "")
    // Direct session control is orchestrator-only even inside compound
    // commands. Other `ao ...` calls (status reads, reports) are left
    // to the config rules.
    if (/^ao(\s|$)/.test(cmd)) {
      const reason = aoDenyReason(cmd)
      if (reason !== null) return reason
      continue
    }
    // gh allowlist: create/view/edit stay usable from any session.
    if (/^gh\s+pr\s+(create|view|edit)(\s|$)/.test(cmd)) continue
    if (/^gh\s+pr\s+merge(\s|$)/.test(cmd)) {
      return "Merging is the orchestrator's job via script/orchestrator-merge.sh; workers never run `gh pr merge`."
    }
    if (/^gh\s+issue\s+delete(\s|$)/.test(cmd)) {
      return "Deleting GitHub issues is never allowed from an agent session."
    }
    if (/^git(\s|$)/.test(cmd)) {
      const reason = gitPushDenyReason(cmd)
      if (reason !== null) return reason
    }
  }
  return null
}

// Guard for `git push`, tolerant of git-level global options between
// `git` and `push` (`git -C <path> push ...`, `git -c k=v push ...`).
// Never blocks git reads or pushing a session branch.
function gitPushDenyReason(cmd: string): string | null {
  const tokens = cmd.split(/\s+/)
  if (tokens[0] !== "git") return null
  // Skip git-level global options to find the subcommand, so
  // `git -C <path> push ...` and `git -c k=v push ...` are still
  // guarded while other subcommands (`git stash push ...`) are not
  // misread as pushes.
  let i = 1
  while (i < tokens.length) {
    const t = tokens[i]
    if (t === "push") break
    if (t === "-C" || t === "-c") {
      i += 2
      continue
    }
    if (t.startsWith("-")) {
      i += 1
      continue
    }
    return null
  }
  if (i >= tokens.length) return null
  // Flags may precede the remote.
  const args = tokens.slice(i + 1)
  if (args.some((t) => t === "-f" || t.startsWith("--force"))) {
    return "Force-push is never allowed; push your session branch with a plain `git push`."
  }
  // Bulk pushes rewrite every ref including the default branch.
  if (args.some((t) => t === "--all" || t === "--mirror" || t.startsWith("--mirror="))) {
    return "Bulk push (`--all`/`--mirror`) is never allowed; push your session branch explicitly."
  }
  // Explicit branch deletion: `--delete` / `-d`.
  if (args.some((t) => t === "--delete" || t === "-d")) {
    return "Remote branch deletion (`git push <remote> --delete <branch>`) is never allowed."
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
