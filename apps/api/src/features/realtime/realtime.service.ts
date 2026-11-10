import { PRESENCE_TTL_MS, type PresenceViewer, type ProjectRole, type RealtimeChannel, type RealtimeEvent, type RealtimeEventType, type RealtimeServerMessage } from "@rinia/shared";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { issues, projectDocuments, projects } from "../../db/schema";
import { assertDocumentAccess, assertIssueAccess } from "../../lib/guest-access";
import { HttpError } from "../../lib/http-error";
import { currentOrigin, logFor } from "../../lib/request-context";
import { assertProjectMembership } from "../../middleware/project-membership.middleware";

/** The part of a WebSocket the hub uses, so tests can pass a plain object. */
export interface RealtimeSocket {
    send(data: string): void;
    close?(code?: number, reason?: string): void;
}

export interface RealtimeConnection {
    socket: RealtimeSocket;
    user: PresenceViewer["user"];
    /** Each subscribed channel and the project it belongs to, so leaving a project drops its issues and documents too. */
    channels: Map<RealtimeChannel, string>;
    /** The user's role in each project they listen to, as of subscribing or the last role change. */
    roles: Map<string, ProjectRole>;
    /** The session that opened the socket, so revoking it can close the socket. */
    sessionId?: string;
}

/** What the hub tells collaborative pages when a connection stops listening to one of their channels. */
export interface CollaborationHooks {
    leave(connection: RealtimeConnection, channel: RealtimeChannel): void;
}

type PresenceEntry = { editing: boolean; expiresAt: number };

/**
 * Who listens to which channel, and who is on which issue or document. It lives in this process: running more than
 * one API instance would need a shared broker (Postgres NOTIFY, Redis) between them.
 */
export class RealtimeHub {
    private channels = new Map<RealtimeChannel, Set<RealtimeConnection>>();
    private presence = new Map<RealtimeChannel, Map<RealtimeConnection, PresenceEntry>>();
    readonly connections = new Set<RealtimeConnection>();
    collaboration?: CollaborationHooks;

    connect(socket: RealtimeSocket, user: PresenceViewer["user"], sessionId?: string): RealtimeConnection {
        const connection: RealtimeConnection = { socket, user, channels: new Map(), roles: new Map(), sessionId };
        this.connections.add(connection);
        return connection;
    }

    /** Closes the sockets of revoked sessions with 4401, which tells each tab it has been signed out. */
    closeSessions(sessionIds: ReadonlySet<string>) {
        if (sessionIds.size === 0) return;
        for (const connection of [...this.connections]) if (connection.sessionId && sessionIds.has(connection.sessionId)) connection.socket.close?.(4401, "Session ended");
    }

    disconnect(connection: RealtimeConnection) {
        for (const channel of [...connection.channels.keys()]) this.unsubscribe(connection, channel);
        this.connections.delete(connection);
    }

    subscribe(connection: RealtimeConnection, channel: RealtimeChannel, projectId: string, role: ProjectRole = "member") {
        connection.channels.set(channel, projectId);
        connection.roles.set(projectId, role);
        let listeners = this.channels.get(channel);
        if (!listeners) this.channels.set(channel, (listeners = new Set()));
        listeners.add(connection);
        // Someone arriving sees who is already there.
        if (this.presence.has(channel)) send(connection, { type: "presence", channel, viewers: this.viewers(channel) });
    }

    unsubscribe(connection: RealtimeConnection, channel: RealtimeChannel) {
        this.leave(connection, channel);
        this.collaboration?.leave(connection, channel);
        connection.channels.delete(channel);
        const listeners = this.channels.get(channel);
        listeners?.delete(connection);
        if (listeners?.size === 0) this.channels.delete(channel);
    }

    /** Joins or renews presence. Only subscribers can be present; a change in who is there or who is editing goes out at once. */
    heartbeat(connection: RealtimeConnection, channel: RealtimeChannel, editing: boolean, now = Date.now()) {
        if (!connection.channels.has(channel)) return;
        let entries = this.presence.get(channel);
        if (!entries) this.presence.set(channel, (entries = new Map()));
        const previous = entries.get(connection);
        entries.set(connection, { editing, expiresAt: now + PRESENCE_TTL_MS });
        if (!previous || previous.editing !== editing) this.broadcastPresence(channel);
    }

    leave(connection: RealtimeConnection, channel: RealtimeChannel) {
        const entries = this.presence.get(channel);
        if (!entries?.delete(connection)) return;
        if (entries.size === 0) this.presence.delete(channel);
        this.broadcastPresence(channel);
    }

    /** Drops presence that stopped sending heartbeats, such as a laptop that went to sleep with the page open. */
    expire(now = Date.now()) {
        for (const [channel, entries] of this.presence) {
            let changed = false;
            for (const [connection, entry] of entries) {
                if (entry.expiresAt > now) continue;
                entries.delete(connection);
                changed = true;
            }
            if (entries.size === 0) this.presence.delete(channel);
            if (changed) this.broadcastPresence(channel);
        }
    }

    /** One person per row, however many tabs they have open; editing in any tab counts. */
    viewers(channel: RealtimeChannel): PresenceViewer[] {
        const byUser = new Map<string, PresenceViewer>();
        for (const [connection, entry] of this.presence.get(channel) ?? []) {
            const known = byUser.get(connection.user.id);
            byUser.set(connection.user.id, { user: connection.user, editing: entry.editing || !!known?.editing });
        }
        return [...byUser.values()];
    }

    /**
     * Sends the event once to every connection listening on any of `channels`. A guest on the project channel hears
     * about the project itself, never about its issues and pages: those reach a guest only on the channel of an issue
     * or page they were allowed to open.
     */
    publish(event: RealtimeEvent, channels: RealtimeChannel[]) {
        const listeners = new Set<RealtimeConnection>();
        const hiddenFromGuests = !PROJECT_EVENT_SUBJECTS.has(event.type.split(".")[0]);
        for (const channel of channels) {
            for (const connection of this.channels.get(channel) ?? []) {
                if (hiddenFromGuests && channel.startsWith("project:") && connection.roles.get(event.projectId) === "guest") continue;
                listeners.add(connection);
            }
        }
        for (const connection of listeners) send(connection, { type: "event", event });
    }

    /**
     * Applies a new role to the user's open sockets. Turning into a guest closes the issues and pages they had open,
     * since each must be shared with them again; any other change keeps them open. Page rooms read the role on every
     * message, so a page turns read-only, or writable, at once.
     */
    changeRole(projectId: string, userId: string, role: ProjectRole) {
        for (const connection of this.connections) {
            if (connection.user.id !== userId || !connection.roles.has(projectId)) continue;
            connection.roles.set(projectId, role);
            for (const [channel, channelProjectId] of [...connection.channels]) {
                if (channelProjectId !== projectId || channel.startsWith("project:") || role !== "guest") continue;
                this.unsubscribe(connection, channel);
                send(connection, { type: "denied", channel });
            }
        }
    }

    /** Someone removed from a project stops hearing about it, on its issues and documents too. */
    revoke(projectId: string, userId: string) {
        for (const connection of this.connections) {
            if (connection.user.id !== userId) continue;
            for (const [channel, channelProjectId] of [...connection.channels]) {
                if (channelProjectId !== projectId) continue;
                this.unsubscribe(connection, channel);
                send(connection, { type: "denied", channel });
            }
        }
    }

    /** Closes one channel for every socket of the user, such as an issue or page no longer shared with them. */
    revokeChannel(userId: string, channel: RealtimeChannel) {
        for (const connection of this.connections) {
            if (connection.user.id !== userId || !connection.channels.has(channel) || connection.roles.get(connection.channels.get(channel)!) !== "guest") continue;
            this.unsubscribe(connection, channel);
            send(connection, { type: "denied", channel });
        }
    }

    private broadcastPresence(channel: RealtimeChannel) {
        const message: RealtimeServerMessage = { type: "presence", channel, viewers: this.viewers(channel) };
        for (const connection of this.channels.get(channel) ?? []) send(connection, message);
    }
}

function send(connection: RealtimeConnection, message: RealtimeServerMessage) {
    // A socket that closed between the lookup and the send must not fail the request that published.
    try {
        connection.socket.send(JSON.stringify(message));
    } catch {
        /* The close handler removes it. */
    }
}

/** Events about the project itself, which a guest on the project channel still hears. */
const PROJECT_EVENT_SUBJECTS = new Set(["project", "member", "column", "label"]);

export const realtimeHub = new RealtimeHub();

/**
 * The project a channel belongs to and the user's role in it, after checking the user may see it. Deleted issues and
 * documents have no channel, and a guest is let into an issue or page only when it was shared with them.
 */
export async function authorizeChannel(channel: RealtimeChannel, user: { id: string }): Promise<{ projectId: string; role: ProjectRole }> {
    const [kind, id] = channel.split(":") as ["project" | "issue" | "document", string];
    if (kind === "project") {
        const project = await db.query.projects.findFirst({ where: eq(projects.id, id), columns: { id: true } });
        if (!project) throw new HttpError(404, "Channel not found");
        return { projectId: project.id, role: await assertProjectMembership(project.id, user.id) };
    }
    if (kind === "issue") {
        const issue = await db.query.issues.findFirst({ where: and(eq(issues.id, id), isNull(issues.deletedAt)), columns: { id: true, projectId: true, assigneeId: true } });
        if (!issue) throw new HttpError(404, "Channel not found");
        return { projectId: issue.projectId, role: await assertIssueAccess(user.id, issue) };
    }
    const document = await db.query.projectDocuments.findFirst({ where: and(eq(projectDocuments.id, id), isNull(projectDocuments.deletedAt)), columns: { projectId: true } });
    if (!document) throw new HttpError(404, "Channel not found");
    return { projectId: document.projectId, role: await assertDocumentAccess(user.id, document.projectId, id) };
}

/**
 * Who hears about a change. The project hears about everything that shows in its lists; comments and relations only
 * matter on their issue page, and an issue or document page also listens on its own channel.
 */
export function channelsFor(event: Pick<RealtimeEvent, "type" | "projectId" | "id" | "issueId">): RealtimeChannel[] {
    const [subject] = event.type.split(".");
    if ((subject === "comment" || subject === "relation") && event.issueId) return [`issue:${event.issueId}`];
    const channels: RealtimeChannel[] = [`project:${event.projectId}`];
    if (subject === "issue") channels.push(`issue:${event.id}`);
    if (subject === "document") channels.push(`document:${event.id}`);
    return channels;
}

/** Tells everyone listening that something changed. Call it after the change is saved; it never throws. */
export function publishChange(type: RealtimeEventType, subject: { projectId: string; id: string; issueId?: string }) {
    try {
        const event: RealtimeEvent = { type, ...subject, ...currentOrigin() };
        realtimeHub.publish(event, channelsFor(event));
    } catch (error) {
        logFor("realtime").error({ err: error, type, projectId: subject.projectId, id: subject.id }, "could not publish a realtime event");
    }
}
