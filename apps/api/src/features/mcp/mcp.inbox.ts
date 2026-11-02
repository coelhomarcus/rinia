import { notificationTypeValues } from "@rinia/shared";
import { z } from "zod";
import { HttpError } from "../../lib/http-error";
import { listNotifications, markAllNotificationsRead, setNotificationRead } from "../notifications/notifications.service";
import type { McpContext } from "./mcp.context";

export function registerInboxTools(context: McpContext) {
    const { tool, user, issueUrl } = context;

    tool(
        "list_notifications",
        {
            title: "List my inbox",
            description: "Lists your inbox, newest first: issues assigned to you, mentions, replies, comments and state changes on issues you follow.",
            inputSchema: {
                unreadOnly: z.boolean().optional().describe("Only notifications you have not read. Default true."),
                limit: z.number().int().min(1).max(200).optional().describe("Default 50."),
            },
            outputSchema: {
                unread: z.number(),
                notifications: z.array(
                    z.object({
                        id: z.string().describe("Pass to mark_notifications_read."),
                        type: z.enum(notificationTypeValues),
                        read: z.boolean(),
                        createdAt: z.string(),
                        actor: z.string().nullable().describe("Username of who did it."),
                        issue: z.object({ identifier: z.string(), title: z.string(), url: z.string() }),
                        excerpt: z.string().nullable().describe("The start of the comment, for comments, replies and mentions."),
                        statusChange: z.object({ from: z.string().nullable(), to: z.string().nullable() }).nullable(),
                    }),
                ),
            },
            annotations: { readOnlyHint: true },
        },
        async (args) => {
            const all = await listNotifications(user.sub);
            const shown = args.unreadOnly === false ? all : all.filter((entry) => !entry.readAt);
            return {
                unread: all.filter((entry) => !entry.readAt).length,
                notifications: shown.slice(0, args.limit ?? 50).map((entry) => ({
                    id: entry.id,
                    type: entry.type,
                    read: !!entry.readAt,
                    createdAt: entry.createdAt.toISOString(),
                    actor: entry.actor?.username ?? null,
                    issue: { identifier: entry.issue.identifier, title: entry.issue.title, url: issueUrl(entry.issue.identifier, entry.issue.title) },
                    excerpt: entry.excerpt,
                    statusChange: entry.status && { from: entry.status.from?.name ?? null, to: entry.status.to?.name ?? null },
                })),
            };
        },
    );

    tool(
        "mark_notifications_read",
        {
            title: "Mark inbox items read",
            description: "Marks notifications as read (or unread again), by the ids list_notifications returned, or every notification with all: true.",
            inputSchema: {
                ids: z.array(z.string().uuid()).max(200).optional(),
                all: z.boolean().optional().describe("Mark every notification read."),
                read: z.boolean().optional().describe("false marks them unread again. Default true."),
            },
            outputSchema: { updated: z.number().describe("How many notifications changed, or -1 for all.") },
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
        },
        async (args) => {
            if (args.all) {
                if (args.read === false) throw new HttpError(400, "Only marking every notification read is supported. Pass ids to mark some unread.");
                await markAllNotificationsRead(user.sub);
                return { updated: -1 };
            }
            if (!args.ids?.length) throw new HttpError(400, "Pass the ids to mark, or all: true.");
            for (const id of args.ids) await setNotificationRead(user.sub, id, args.read ?? true);
            return { updated: args.ids.length };
        },
    );
}
