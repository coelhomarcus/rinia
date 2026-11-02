<p align="center">
  <img src="apps/web/public/brand/rinia-icon-dark.svg" alt="Rinia" width="96">
</p>
<h1 align="center">Rinia</h1>
<p align="center"><b>The calm workspace for projects, issues, and docs</b></p>

<p align="center">
    <a href="#-features"><b>Features</b></a> •
    <a href="#-getting-started"><b>Getting started</b></a> •
    <a href="https://github.com/alty-oss/rinia/issues"><b>Issues</b></a>
</p>

<br />

Rinia is a self-hosted platform where a team plans work, writes about it, and ships it, all in one place. Issues, documents, people, and AI tools share the same projects, so nothing lives in a tab of its own.

## 🌟 Features

- **Issues**
  Project-scoped IDs such as `TK-184`, priorities, estimates, due dates, labels, sub-issues, and relations. Work in a list or on a Kanban board, group and filter by assignee, state, or label, and act on many issues at once.

- **Views and inbox**
  Save any filter as a view, follow your own work under **My issues**, pin favorites, and catch mentions, assignments, and replies in your inbox. A search palette jumps to any issue or page.

- **Conversations and history**
  Comment with threads, reactions, and mentions. Every change lands in an activity feed, and every edit to a description is kept as a version you can open and restore.

- **Documents**
  A block editor with slash commands, tables, images, and mentions. People edit the same page at the same time, with live cursors and a lock on the line someone is typing in. Pages work offline and sync when you are back.

- **Projects and teams**
  Give every project an icon and a cover, shape its states and labels, and add members by username with a preview of who you are adding. Deletes can be undone.

- **Realtime**
  Boards, lists, comments, and pages update as teammates work, and you see who else is on the page.

- **MCP and API**
  Connect Claude Code, Claude, VS Code, Codex, Gemini CLI, or any MCP client at `/api/mcp` with a personal API token from **Settings → Integrations**. Tools act as you: they list, search, create, and update issues, comment, and write pages in the projects you belong to. What they change shows in the activity feed with the tool's avatar beside yours, and revoking a token cuts it off at once. The same token works with the REST API.

- **Administration**
  Site admins see every project with its owner, members, and size, without reading what is inside, and registration is gated by a code.

- **Made to feel at home**
  Dark and light themes, keyboard shortcuts, and an interface in English and Portuguese.

## 🚀 Getting started

### Docker

The `Dockerfile` builds the web app and the API into a single image and applies pending migrations on startup.

```bash
docker build -t rinia .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgres://... \
  -e JWT_SECRET=... \
  -e SPECIAL_REGISTRATION_CODE=... \
  rinia
```

### Local development

You need [Bun](https://bun.com) 1.3.14+ and PostgreSQL.

```bash
bun install
docker run --name rinia-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=rinia -p 5432:5432 -d postgres:16
bun run db:migrate
bun run db:seed
```

The seed creates three projects with issues, labels, and documents, plus the accounts `admin`, `ana`, and `bruno`, all with the password `rinia1234`. Run `bun run db:reset` to start over. Both commands refuse to run with `NODE_ENV=production` or against a database that is not on your machine.

Start the API and the web app in separate terminals:

```bash
bun run dev:api   # http://localhost:3000
bun run dev:web   # http://localhost:5173
```

### Environment variables

Set these in `apps/api/.env`, or pass them to the container.

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret used to sign sessions |
| `JWT_EXPIRES_IN` | Session lifetime, for example `7d` |
| `SPECIAL_REGISTRATION_CODE` | Code required to create an account |
| `ADMIN_USERNAMES` | Comma-separated admin usernames |
| `PORT` | API port, default `3000` |
| `APP_URL` | Public address of Rinia, used for links in MCP results. Defaults to the address each request came to |

## ⚙️ Built with

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Bun](https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white)](https://bun.com/)
[![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Drizzle](https://img.shields.io/badge/Drizzle-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black)](https://orm.drizzle.team/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)

## 🤝 Contributing

Found a bug or have an idea? [Open an issue](https://github.com/alty-oss/rinia/issues). Commits and pull requests follow Conventional Commits; see [AGENTS.md](./AGENTS.md).

Before opening a pull request, run `bun run typecheck`, `bun run test`, and `bun run build`. Database tests run with `bun run test:db` against a local PostgreSQL set in `TEST_DATABASE_URL`; without it they are skipped.
