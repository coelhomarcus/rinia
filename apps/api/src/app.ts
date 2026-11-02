import path from "path";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { adminRouter } from "./features/admin/admin.routes";
import { apiTokensRouter } from "./features/api-tokens/api-tokens.routes";
import { authRouter } from "./features/auth/auth.routes";
import { favoritesRouter } from "./features/favorites/favorites.routes";
import { issueCommentsRouter, issueRelationsRouter, issuesRouter } from "./features/issues/issues.routes";
import { mcpRouter } from "./features/mcp/mcp.routes";
import { myIssuesRouter, notificationsRouter } from "./features/notifications/notifications.routes";
import { projectsRouter } from "./features/projects/projects.routes";
import { usersRouter } from "./features/users/users.routes";
import { assignRequestId, requestContext } from "./lib/request-context";
import { accessLog } from "./middleware/access-log.middleware";
import { errorHandler } from "./middleware/error-handler.middleware";

export const app = express();

// First, so every response carries its X-Request-Id and every API call is logged, even one whose body fails to parse.
app.use(assignRequestId);
app.use(accessLog());

// Runs behind Dokploy's reverse proxy — without this, the IP-based rate limiter
// would see the proxy's internal IP instead of each client's real IP.
app.set("trust proxy", 1);

// CSP is intentionally disabled: Helmet's default may block the SPA bundle (Vite)
// before each directive has been thoroughly tested. The other protections
// (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, HSTS, etc.) are still worthwhile.
app.use(helmet({ contentSecurityPolicy: false }));

// URL images keep document payloads small; allow long text and tables without the default 100 KB limit.
app.use("/api/projects/:projectId/documents", express.json({ limit: "2mb" }));
app.use(express.json());
app.use(cookieParser());
// Lets services tag realtime events with who made the change, and log with the request's id. It runs after the body
// parsers so the context is not lost in their stream callbacks.
app.use(requestContext);

app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/issues", issuesRouter);
app.use("/api/comments", issueCommentsRouter);
app.use("/api/relations", issueRelationsRouter);
app.use("/api/users", usersRouter);
app.use("/api/favorites", favoritesRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/my-issues", myIssuesRouter);
app.use("/api/admin", adminRouter);
app.use("/api/api-tokens", apiTokensRouter);
app.use("/api/mcp", mcpRouter);

// Any /api/* route not mapped above -> JSON 404, before the static fallback below
// (otherwise the SPA catch-all would swallow misspelled or unknown API calls).
app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
});

// Resolved from cwd, not __dirname (see the note in db/migrate.ts) — the Dockerfile
// sets WORKDIR=/app/apps/api, so this points to apps/web/dist in both development and production.
const webDist = path.resolve(process.cwd(), "../web/dist");
app.use(express.static(webDist));
app.get("*", (_req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
});

app.use(errorHandler);
