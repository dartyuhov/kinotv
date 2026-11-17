# Issue tracker: beads (bd)

Issues for this repo live in beads, a git-backed issue tracker stored in `.beads/`. Run `bd` from the repo root.

## Conventions

- A spec is an **epic**: `bd create --type epic --title "<title>" --body-file <spec.md> --labels <triage-label>`
- Implementation tickets are children of the epic, one issue per ticket (never one combined tickets issue):
  `bd create --parent <epic-id> --type task|feature|bug --title "<title>" --body-file <ticket.md> --labels <triage-label>`
- Triage state is recorded as labels (see `triage-labels.md` for the strings): `bd label add <id> <label>` / `bd label remove <id> <label>`
- Comments and conversation history: `bd comment <id> "<text>"`
- Blocking relationships: `bd dep add <id> --blocked-by <other-id>`

## When a skill says "publish to the issue tracker"

Create the issue with `bd create` as above and report the new issue ID to the user.

## When a skill says "fetch the relevant ticket"

`bd show <id>`. Related lookups:
- an epic's children: `bd children <epic-id>`
- text search: `bd search "<text>"`
- by triage label: `bd list --label <label>`

The user will normally pass the issue ID directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is an epic with one **child** issue per ticket.

- **Map**: the epic (`bd show <epic-id>`); its description holds the Notes / Decisions-so-far / Fog body. Add new decisions with `bd note <epic-id> "<gist> (<ticket-id>)"`.
- **Child ticket**: `bd create --parent <epic-id> --type spike|task|decision --title "<question>" --body-file <body.md>`. Use `spike` for research or prototype tickets, `decision` for grilling, and `task` for tasks.
- **Blocking**: `bd dep add <id> --blocked-by <other-id>`. A ticket is unblocked when all its blockers are closed.
- **Frontier**: `bd ready`, filtered to the epic's children (`bd children <epic-id>`). The lowest ID wins.
- **Claim**: `bd update <id> --claim` before any work.
- **Resolve**: `bd close <id> --reason "<answer summary>"`, then add the decision to the map with `bd note <epic-id> ...`.
