import { z } from "zod";
import { issueOrderValues } from "./issues";

/** Why someone got a notification. When one action has several reasons for the same person, the first listed wins. */
export const notificationTypeValues = ["assigned", "mentioned", "replied", "commented", "status_changed"] as const;
export type NotificationType = (typeof notificationTypeValues)[number];

export const updateNotificationSchema = z.object({ read: z.boolean() }).strict();
export type UpdateNotificationInput = z.infer<typeof updateNotificationSchema>;

/** The tabs of "My issues": issues assigned to you, created by you, or that you follow. */
/** My issues tabs: assigned to me, created by me, followed (subscribed), and the ones I last acted on. */
export const myIssuesFilterValues = ["assigned", "created", "following", "activity"] as const;
export type MyIssuesFilter = (typeof myIssuesFilterValues)[number];

export const myIssuesQuerySchema = z.object({
    filter: z.enum(myIssuesFilterValues).default("assigned"),
    orderBy: z.enum(issueOrderValues).default("updated"),
});
export type MyIssuesQuery = z.infer<typeof myIssuesQuerySchema>;
