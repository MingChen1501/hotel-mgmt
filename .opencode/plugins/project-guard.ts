// project-guard: project hooks for hotel-mgmt.
//
// - Block accidental edits to build-generated paths (with a clear message explaining the right fix).
// - Cap shell timeouts so a hung build/serve cannot hold the agent.
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

    // Avoid hung shells (heavy builds) holding the agent too long.
    await ctx.shell.hook("create.before", (event: any) => {
      const MAX_TIMEOUT_MS = 300000
      if (typeof event.timeout === "number" && event.timeout > MAX_TIMEOUT_MS) {
        event.timeout = MAX_TIMEOUT_MS
      }
    })
  },
}
