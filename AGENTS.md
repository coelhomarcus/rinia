# Commits and pull requests

Commit subjects, PR titles, and PR bodies follow Conventional Commits. Write them in English.

```
<type>: <imperative summary>
```

```
refactor: make Cropin frontend-only
fix: keep the session cookie on HTTPS
feat: add project document pages
```

## Subject

- Use a lowercase type, then `: `, then a lowercase imperative summary.
- Keep the subject to one line. Do not end it with a period.
- Say what changed. Add a body only when the subject is not enough, separated by a blank line.
- Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`.

## No co-authorship

Commits, pull requests, titles, bodies, and trailers never include co-authorship or tool attribution.

Do not add any of these, including in a footer or a PR description:

- `Co-authored-by`
- `Co-authored`
- coautoria
- `Generated-by`, `Generated with`, or `Made with`
- a mention that Cursor, Claude, or another assistant wrote the change

One author only: the person who made the change. Do not pass `--trailer`, do not amend a message to insert a co-author, and do not put a co-author in the PR body.

# Database migrations

The schema in `apps/api/src/db/schema` is the source of truth. Migrations live in `apps/api/drizzle`, and `drizzle/meta` keeps a snapshot of the schema for the latest one.

- Change the schema, then run `bun run db:generate`. It diffs the schema against the latest snapshot and writes the SQL, the snapshot, and the journal entry.
- To write a migration by hand, still start with `bun run db:generate --name <name>` so it writes the snapshot and the journal entry, then replace the generated SQL with your own. For a migration with no schema change (data only, or a rename the schema cannot see), use `bun run db:generate --custom --name <name>`, which writes an empty SQL file with both. Never add a migration without its `drizzle/meta/<number>_snapshot.json`: the next `db:generate` would diff against an older snapshot and write a migration that redoes changes the database already has.
- Run `bun run db:check` against a local PostgreSQL before opening a pull request. It fails if the latest snapshot does not match the schema, or if a database built by the migrations differs from one built from the schema. CI runs it on every pull request.
- With no schema change, `bun run db:generate` must write nothing.
