import { z } from "zod";

export const tiptapNodeSchema = z.record(z.unknown());
export const tiptapDocumentSchema = z.object({
    type: z.literal("doc"),
    content: z.array(tiptapNodeSchema).default([]),
});
export type TiptapDocument = z.infer<typeof tiptapDocumentSchema>;

/** Linear's five levels. "none" is the default for new issues. */
export const issuePriorityValues = ["none", "low", "medium", "high", "urgent"] as const;
export type IssuePriority = (typeof issuePriorityValues)[number];
export const issueRelationValues = ["blocks", "blocked_by", "related", "duplicate"] as const;
export const issueEstimateValues = [1, 2, 3, 5, 8] as const;
/** A calendar day, `YYYY-MM-DD`, with no time or zone: an issue is due on a day, wherever its people are. */
export const dueDateSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
    .refine((value) => {
        const date = new Date(`${value}T00:00:00Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
    }, "Use a real calendar date");
export const issueOrderValues = ["position", "priority", "updated", "number", "due"] as const;
export type IssueOrder = (typeof issueOrderValues)[number];
/** An issue's labels, each once. An empty list removes them all. */
export const MAX_ISSUE_LABELS = 20;
export const categoryIdsSchema = z
    .array(z.string().uuid())
    .max(MAX_ISSUE_LABELS)
    .transform((ids) => [...new Set(ids)]);
const estimateSchema = z.number().int().refine((value) => issueEstimateValues.includes(value as (typeof issueEstimateValues)[number]), "Estimate must be 1, 2, 3, 5, or 8");

export const createIssueSchema = z.object({
    columnId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    descriptionJson: tiptapDocumentSchema.optional(),
    categoryIds: categoryIdsSchema.optional(),
    assigneeId: z.string().uuid().nullable().optional(),
    priority: z.enum(issuePriorityValues).default("none"),
    parentIssueId: z.string().uuid().nullable().optional(),
    estimate: estimateSchema.nullable().optional(),
    dueDate: dueDateSchema.nullable().optional(),
});
export type CreateIssueInput = z.infer<typeof createIssueSchema>;

export const updateIssueSchema = z
    .object({
        title: z.string().trim().min(1).max(200).optional(),
        descriptionJson: tiptapDocumentSchema.optional(),
        expectedDescriptionRevision: z.number().int().nonnegative().optional(),
        columnId: z.string().uuid().optional(),
        position: z.number().finite().optional(),
        categoryIds: categoryIdsSchema.optional(),
        assigneeId: z.string().uuid().nullable().optional(),
        priority: z.enum(issuePriorityValues).optional(),
        parentIssueId: z.string().uuid().nullable().optional(),
        estimate: estimateSchema.nullable().optional(),
        dueDate: dueDateSchema.nullable().optional(),
    })
    .strict()
    .superRefine((value, context) => {
        if (value.descriptionJson !== undefined && value.expectedDescriptionRevision === undefined) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ["expectedDescriptionRevision"], message: "Expected description revision is required" });
        }
        if (value.descriptionJson === undefined && value.expectedDescriptionRevision !== undefined) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ["expectedDescriptionRevision"], message: "Description revision requires a description update" });
        }
    });
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;

/** How many issues one bulk request can change. */
export const MAX_BULK_ISSUES = 250;
const bulkIssueIdsSchema = z
    .array(z.string().uuid())
    .min(1)
    .max(MAX_BULK_ISSUES)
    .transform((ids) => [...new Set(ids)]);

/**
 * One change applied to every selected issue. `categoryIds` replaces their labels; `addCategoryIds` and
 * `removeCategoryIds` add or remove some while keeping the rest.
 */
export const bulkIssuePatchSchema = z
    .object({
        columnId: z.string().uuid().optional(),
        priority: z.enum(issuePriorityValues).optional(),
        assigneeId: z.string().uuid().nullable().optional(),
        estimate: estimateSchema.nullable().optional(),
        dueDate: dueDateSchema.nullable().optional(),
        categoryIds: categoryIdsSchema.optional(),
        addCategoryIds: categoryIdsSchema.optional(),
        removeCategoryIds: categoryIdsSchema.optional(),
    })
    .strict()
    .refine((patch) => Object.keys(patch).length > 0, "Choose something to change");
export type BulkIssuePatch = z.infer<typeof bulkIssuePatchSchema>;

/** The labels an issue ends up with after a bulk change: a replacement set, then whatever is added and removed. */
export function nextLabels(current: string[], patch: Pick<BulkIssuePatch, "categoryIds" | "addCategoryIds" | "removeCategoryIds">) {
    const removed = new Set(patch.removeCategoryIds ?? []);
    const base = patch.categoryIds ?? current;
    return [...new Set([...base, ...(patch.addCategoryIds ?? [])])].filter((id) => !removed.has(id));
}

export const bulkUpdateIssuesSchema = z.object({ issueIds: bulkIssueIdsSchema, patch: bulkIssuePatchSchema }).strict();
export type BulkUpdateIssuesInput = z.infer<typeof bulkUpdateIssuesSchema>;
export const bulkDeleteIssuesSchema = z.object({ issueIds: bulkIssueIdsSchema }).strict();
export type BulkDeleteIssuesInput = z.infer<typeof bulkDeleteIssuesSchema>;

export const issueListQuerySchema = z.object({
    columnId: z.string().uuid().optional(),
    priority: z.enum(issuePriorityValues).optional(),
    assigneeId: z.string().uuid().optional(),
    /** Comma-separated label ids. An issue matches when it has any of them. */
    categoryIds: z
        .string()
        .optional()
        .transform((value) => (value ? value.split(",").filter(Boolean) : undefined))
        .pipe(z.array(z.string().uuid()).max(MAX_ISSUE_LABELS).optional()),
    groupBy: z.enum(["status", "assignee"]).optional(),
    orderBy: z.enum(issueOrderValues).default("position"),
    /** Page size. Omit it to return every matching issue. `0` returns the count only. */
    limit: z.coerce.number().int().min(0).max(200).optional(),
    /** Keyset cursor from the previous page, for the active `orderBy`. */
    cursor: z.string().min(1).max(512).optional(),
    /** `exclude` leaves closed and cancelled issues out; `only` returns just those. */
    closed: z.enum(["include", "exclude", "only"]).optional(),
});
export type IssueListQuery = z.infer<typeof issueListQuerySchema>;

/** A new comment, or with `parentCommentId`, a reply in that comment's thread. */
export const createIssueCommentSchema = z.object({ contentJson: tiptapDocumentSchema, parentCommentId: z.string().uuid().optional() });
export const updateIssueCommentSchema = z.object({ contentJson: tiptapDocumentSchema });
export type CreateIssueCommentInput = z.infer<typeof createIssueCommentSchema>;
export type UpdateIssueCommentInput = z.infer<typeof updateIssueCommentSchema>;

/** A single emoji, flags and skin tones included, and nothing else. */
export const reactionEmojiSchema = z
    .string()
    .trim()
    .min(1)
    .max(32)
    .refine((value) => /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Component}|\u200d|\ufe0f)+$/u.test(value) && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value) && [...new Intl.Segmenter().segment(value)].length === 1, "Use a single emoji");
export const commentReactionSchema = z.object({ emoji: reactionEmojiSchema }).strict();
export type CommentReactionInput = z.infer<typeof commentReactionSchema>;

export const createIssueRelationSchema = z.object({
    targetIssueIdentifier: z.string().trim().min(3).max(32),
    type: z.enum(issueRelationValues),
});
export type CreateIssueRelationInput = z.infer<typeof createIssueRelationSchema>;

export const updateProjectDocumentSchema = z.object({ contentJson: tiptapDocumentSchema });
export type UpdateProjectDocumentInput = z.infer<typeof updateProjectDocumentSchema>;
