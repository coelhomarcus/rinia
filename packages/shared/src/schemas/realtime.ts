import { z } from "zod";

/** Where the realtime socket lives. It shares the session cookie with the REST API. */
export const REALTIME_PATH = "/api/realtime";

/** Each browser tab sends its own id with every request, so it can skip the events it caused itself. */
export const REALTIME_CLIENT_HEADER = "x-rinia-client";

/** How often an open page says it is still there, and how long the server waits before it drops someone who stopped saying so. */
export const PRESENCE_HEARTBEAT_MS = 10_000;
export const PRESENCE_TTL_MS = 30_000;

/** The largest collaboration message the socket accepts, in base64 characters (about 1.5 MB of Yjs data). */
export const DOCUMENT_MESSAGE_MAX_CHARS = 2 * 1024 * 1024;

export const realtimeEventTypeValues = [
    "issue.created",
    "issue.updated",
    "issue.deleted",
    "issue.restored",
    "comment.created",
    "comment.updated",
    "comment.deleted",
    "comment.restored",
    "comment.reacted",
    "relation.created",
    "relation.deleted",
    "column.created",
    "column.updated",
    "column.deleted",
    "label.created",
    "label.updated",
    "label.deleted",
    "document.created",
    "document.updated",
    "document.deleted",
    "document.restored",
    "view.created",
    "view.updated",
    "view.deleted",
    "view.restored",
    "project.updated",
    "member.added",
    "member.updated",
    "member.removed",
    "share.created",
    "share.deleted",
] as const;
export type RealtimeEventType = (typeof realtimeEventTypeValues)[number];

/** What changed, after the change is saved. It names the thing and leaves loading it to the client. */
export interface RealtimeEvent {
    type: RealtimeEventType;
    projectId: string;
    /** The id of what changed: an issue, a comment, a column, a document, and so on. */
    id: string;
    /** For comments and relations, the issue they belong to. */
    issueId?: string;
    actorId: string | null;
    /** The tab that made the change, from the `x-rinia-client` header. */
    clientId: string | null;
}

/** A project's changes, one issue's comments and presence, or one document's presence. */
export const realtimeChannelSchema = z.string().regex(/^(project|issue|document):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
export type RealtimeChannel = `${"project" | "issue" | "document"}:${string}`;
export const documentChannelSchema = realtimeChannelSchema.refine((channel) => channel.startsWith("document:"), "Not a document channel");
export const presenceChannelSchema = realtimeChannelSchema.refine((channel) => !channel.startsWith("project:"), "Presence is kept per issue or document");

export const realtimeClientMessageSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("subscribe"), channel: realtimeChannelSchema }),
    z.object({ type: z.literal("unsubscribe"), channel: realtimeChannelSchema }),
    /** Joins the channel's presence, or renews it. Sent again every `PRESENCE_HEARTBEAT_MS` while the page is open. */
    z.object({ type: z.literal("presence"), channel: presenceChannelSchema, editing: z.boolean().default(false) }),
    z.object({ type: z.literal("leave"), channel: presenceChannelSchema }),
    z.object({ type: z.literal("ping") }),
    /** A Yjs sync or awareness message for a page being edited together, base64 encoded. */
    z.object({ type: z.literal("doc"), channel: documentChannelSchema, data: z.string().max(DOCUMENT_MESSAGE_MAX_CHARS) }),
]);
export type RealtimeClientMessage = z.input<typeof realtimeClientMessageSchema>;

export interface PresenceViewer {
    user: { id: string; name: string; username: string; avatarUrl: string | null };
    /** True while one of the person's tabs is changing the page. */
    editing: boolean;
}

export type RealtimeServerMessage =
    | { type: "ready" }
    | { type: "subscribed"; channel: RealtimeChannel }
    | { type: "denied"; channel: RealtimeChannel }
    | { type: "event"; event: RealtimeEvent }
    | { type: "presence"; channel: RealtimeChannel; viewers: PresenceViewer[] }
    | { type: "doc"; channel: RealtimeChannel; data: string }
    | { type: "pong" };
