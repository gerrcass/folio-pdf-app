# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues in `gerrcass/folio-pdf-app`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body-file <file>`.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.
- **List open work**: `gh issue list --state open --json number,title,body,labels`.
- **Comment**: `gh issue comment <number> --body "..."`.
- **Close**: `gh issue close <number> --comment "..."` once every acceptance criterion is met and evidence is linked.
- **Labels**: `gh issue edit <number> --add-label "ready-for-agent"`.

## Blocking edges

GitHub issue dependencies are the canonical representation. Add one with:

```sh
gh api --method POST repos/gerrcass/folio-pdf-app/issues/<child>/dependencies/blocked_by \
  -F issue_id=<blocker-database-id>
```

`<blocker-database-id>` is the numeric database id (`gh api repos/gerrcass/folio-pdf-app/issues/<n> --jq .id`), not the issue number. If the API is unavailable, put a `Blocked by: #<n>` line at the top of the child body.

## Pull requests as a triage surface

**PRs as a request surface: no.**
