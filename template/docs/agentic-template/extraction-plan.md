# Extraction plan: from starter docs to a real template

Status: active (extracted — see below). How this starter became the standalone `template/` plus installer. No new repository was created.

## Goal state

A new project starts from the template with one command, gets the
`docs/` tree, the role files, the gate reference, the conventions, and
the bootstrap guide — and contains zero source-repo history or
project-specific content.

## Options

### Option A — GitHub template repository (recommended)

1. Create `gh repo create [owner]/agentic-coding-template --template`
   from a cleaned copy of a repo containing only: the `docs/` tree
   (with project nouns replaced by placeholders), the role files, the
   agent guide skeleton, `script/ao-role-footer.sh`, minimal CI, and
   `bootstrap.md` as its README entry.
2. Cleaning checklist: drop all history referencing the source project,
   all content directories, all baselines/fixtures, all host-specific
   config (custom domains, analytics IDs, secrets).
3. Consumers start with `gh repo create [owner]/[repo] --template
   [owner]/agentic-coding-template --clone` and follow `bootstrap.md`
   from step 2 (repo already exists).

Pros: one-command start, GitHub-native, updates flow by comparing
against the template. Cons: requires maintaining a second repository;
template drift needs periodic sync decisions.

### Option B — `degit`-style skeleton directory

1. Keep a `skeleton/` directory (in the template repo, once it exists)
   with the same file set as Option A.
2. Consumers start with `npx degit [owner]/agentic-coding-template/skeleton [repo]`
   (or plain `cp -r` / `git archive`), with no git history carried over.

Pros: no template-repo machinery, trivial to inspect. Cons: no
update path; consumers freeze at copy time.

### Option C — scripted bootstrap

1. Ship a small script (e.g. `script/bootstrap-from-template`) that
   takes `[owner]/[repo]` plus language/toolchain answers and emits the
   docs tree, role files, labels, and branch-protection calls.
2. The script encodes the placeholder substitutions (project name,
   language, build/test commands) that Options A/B leave manual.

Pros: fewest manual steps, adapts to stack answers. Cons: a script is
code to maintain and test across platforms; overkill until at least two
real adoptions prove the parameter set.

## Recommendation (record)

Option C (scripted bootstrap) was implemented in-repo instead of
waiting for a second adoption: the `template/` directory plus
`template/script/install-template.sh` carries the file set of Option A
with the placeholder substitution of Option C, and no template
machinery to maintain. Consumers copy without git history (plain
`cp`-style install into their own repo).

## Extraction record

The standalone template now lives at `template/` in this repository:

- `template/README.md` (what it is, quick start, payload table),
  `template/ONBOARDING.md` (new-project runbook).
- `template/AGENTS.md` with the `{{PROJECT_NAME}}`, `{{REPO_SLUG}}`,
  `{{DEFAULT_BRANCH}}`, `{{DOMAIN}}` placeholders (documented in the
  file); no project-specific rules.
- Role files, skills (`project-verify` is the generic replacement
  for the old project-specific verify skill), commands, permission
  config, and guard plugin with project nouns replaced.
- Issue/PR templates, document index and taxonomy, conventions, and
  the sanctioned scripts.
- `template/script/install-template.sh`: copies the payload into a
  target git repo (never overwrites without `--force`), substitutes
  placeholders from flags, supports `--dry-run`, is idempotent,
  refuses non-git targets, fails closed on leftover placeholders,
  and prints the next steps.

## Open decision (still NOT taken)

> **Create a new repository under the owner's account to host the
> standalone template?** Explicit owner approval required. The in-repo
> `template/` is sufficient until a second adoption proves otherwise;
> raise it at the next retrospective, with the recommendation above
> and the cleaning checklist as input.
