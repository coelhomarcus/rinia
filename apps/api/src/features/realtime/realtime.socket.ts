import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { DOCUMENT_MESSAGE_MAX_CHARS, REALTIME_PATH, realtimeClientMessageSchema, type RealtimeChannel, type RealtimeServerMessage } from "@rinia/shared";
import { eq } from "drizzle-orm";
import { WebSocketServer, type WebSocket } from "ws";
import { db } from "../../db";
import { users } from "../../db/schema";
import { SESSION_COOKIE_NAME } from "../../lib/cookies";
import { type JwtPayload, verifyToken } from "../../lib/jwt";
import { documentRooms, fromBase64 } from "../documents/document-rooms";
import { authorizeChannel, type RealtimeConnection, realtimeHub } from "./realtime.service";

/** How often the server checks that each socket still answers, and that its session has not expired. */
const LIVENESS_INTERVAL_MS = 30_000;
const PRESENCE_SWEEP_MS = 5_000;

export function sessionToken(cookieHeader: string | undefined): string | undefined {
    for (const part of cookieHeader?.split(";") ?? []) {
        const [name, ...value] = part.trim().split("=");
        if (name !== SESSION_COOKIE_NAME) continue;
        try {
            return decodeURIComponent(value.join("="));
        } catch {
            return undefined;
        }
    }
    return undefined;
}

/**
 * Browsers send cookies with a WebSocket handshake from any site, so a socket opened by another origin is refused
 * (cross-site WebSocket hijacking). Clients without an Origin header, which are not browsers, still need the cookie.
 */
export function sameOrigin(req: Pick<IncomingMessage, "headers">): boolean {
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
        const host = new URL(origin).host;
        const forwarded = req.headers["x-forwarded-host"];
        return host === req.headers.host || (typeof forwarded === "string" && forwarded.split(",").some((value) => value.trim() === host));
    } catch {
        return false;
    }
}

function reject(socket: Duplex, status: 401 | 403 | 404) {
    const reason = status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : "Not Found";
    socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

function send(socket: WebSocket, message: RealtimeServerMessage) {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

type LiveSocket = WebSocket & { alive?: boolean };

/** Accepts realtime sockets on the API's HTTP server, authenticated with the same session cookie as the REST API. */
export function attachRealtime(server: Server) {
    realtimeHub.collaboration = documentRooms;
    const wss = new WebSocketServer({ noServer: true, maxPayload: DOCUMENT_MESSAGE_MAX_CHARS + 1024 });

    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        if (new URL(req.url ?? "/", "http://localhost").pathname !== REALTIME_PATH) return reject(socket, 404);
        if (!sameOrigin(req)) return reject(socket, 403);
        const token = sessionToken(req.headers.cookie);
        let session: JwtPayload & { exp?: number };
        try {
            if (!token) throw new Error("No session");
            session = verifyToken(token);
        } catch {
            return reject(socket, 401);
        }
        wss.handleUpgrade(req, socket, head, (ws) => void accept(ws, session));
    });

    const liveness = setInterval(() => {
        for (const ws of wss.clients as Set<LiveSocket>) {
            if (ws.alive === false) {
                ws.terminate();
                continue;
            }
            ws.alive = false;
            ws.ping();
        }
    }, LIVENESS_INTERVAL_MS);
    const sweep = setInterval(() => realtimeHub.expire(), PRESENCE_SWEEP_MS);
    liveness.unref();
    sweep.unref();
    server.on("close", () => {
        clearInterval(liveness);
        clearInterval(sweep);
    });
}

async function accept(ws: LiveSocket, session: JwtPayload & { exp?: number }) {
    ws.alive = true;
    ws.on("pong", () => (ws.alive = true));
    // Messages that arrive while the user loads are kept and handled in order once it has.
    const pending: string[] = [];
    let connection: RealtimeConnection | undefined;
    let queue = Promise.resolve();
    const handle = (raw: string) => {
        queue = queue.then(() => receive(ws, connection!, raw)).catch((error) => console.error("Realtime message failed", error));
    };
    ws.on("message", (data) => (connection ? handle(data.toString()) : pending.push(data.toString())));
    ws.on("close", () => {
        if (connection) realtimeHub.disconnect(connection);
        connection = undefined;
    });

    const user = await db.query.users.findFirst({ where: eq(users.id, session.sub), columns: { id: true, name: true, username: true, avatarUrl: true } }).catch(() => undefined);
    if (!user) return ws.close(4401, "Invalid session");
    if (ws.readyState !== ws.OPEN) return;
    connection = realtimeHub.connect(ws, user);
    // The session cookie outlives nothing: once the token expires, the socket closes and the client signs in again.
    if (session.exp) {
        const expiresIn = session.exp * 1000 - Date.now();
        const timer = setTimeout(() => ws.close(4401, "Session expired"), Math.min(Math.max(expiresIn, 0), 2 ** 31 - 1));
        ws.on("close", () => clearTimeout(timer));
    }
    send(ws, { type: "ready" });
    pending.splice(0).forEach(handle);
}

async function receive(ws: WebSocket, connection: RealtimeConnection, raw: string) {
    let json: unknown;
    try {
        json = JSON.parse(raw);
    } catch {
        return;
    }
    const parsed = realtimeClientMessageSchema.safeParse(json);
    if (!parsed.success || !realtimeHub.connections.has(connection)) return;
    const message = parsed.data;
    if (message.type === "ping") return send(ws, { type: "pong" });
    const channel = message.channel as RealtimeChannel;
    if (message.type === "doc") return documentRooms.receive(connection, channel, fromBase64(message.data));
    if (message.type === "unsubscribe") return realtimeHub.unsubscribe(connection, channel);
    if (message.type === "leave") return realtimeHub.leave(connection, channel);
    if (message.type === "presence") return realtimeHub.heartbeat(connection, channel, message.editing);
    if (connection.channels.has(channel)) return send(ws, { type: "subscribed", channel });
    try {
        const projectId = await authorizeChannel(channel, { id: connection.user.id });
        if (!realtimeHub.connections.has(connection)) return;
        realtimeHub.subscribe(connection, channel, projectId);
        // The page is loaded before the client hears it can sync, so its first message finds the room ready.
        if (channel.startsWith("document:")) await documentRooms.join(connection, channel.slice("document:".length));
        send(ws, { type: "subscribed", channel });
    } catch {
        // A page that could not be loaded must not leave the tab listening to it.
        realtimeHub.unsubscribe(connection, channel);
        send(ws, { type: "denied", channel });
    }
}
