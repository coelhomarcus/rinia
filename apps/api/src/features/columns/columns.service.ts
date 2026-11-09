import { POSITION_GAP, type CreateColumnInput, type UpdateColumnInput } from "@rinia/shared";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { respaceColumnsIfCrowded } from "../../db/positions";
import { boardColumns, issues } from "../../db/schema";
import { HttpError } from "../../lib/http-error";
import { publishChange } from "../realtime/realtime.service";

async function nextColumnPosition(projectId: string): Promise<number> {
    const [last] = await db
        .select({ position: boardColumns.position })
        .from(boardColumns)
        .where(eq(boardColumns.projectId, projectId))
        .orderBy(desc(boardColumns.position))
        .limit(1);

    return (last?.position ?? 0) + POSITION_GAP;
}

export async function listColumns(projectId: string) {
    return db.query.boardColumns.findMany({
        where: eq(boardColumns.projectId, projectId),
        // The respacing and the migration break ties by age, so two columns that share a position keep one order.
        orderBy: [asc(boardColumns.position), asc(boardColumns.createdAt), asc(boardColumns.id)],
    });
}

export async function createColumn(projectId: string, input: CreateColumnInput) {
    const position = await nextColumnPosition(projectId);

    const [column] = await db.insert(boardColumns).values({ projectId, name: input.name, color: input.color, position }).returning();
    publishChange("column.created", { projectId, id: column.id });

    return column;
}

export async function updateColumn(projectId: string, columnId: string, input: UpdateColumnInput) {
    const [column] = await db
        .update(boardColumns)
        .set(input)
        .where(and(eq(boardColumns.id, columnId), eq(boardColumns.projectId, projectId)))
        .returning();

    if (!column) {
        throw new HttpError(404, "Column not found");
    }
    if (input.position !== undefined) {
        const respaced = await respaceColumnsIfCrowded(projectId, [columnId]);
        column.position = respaced?.get(columnId) ?? column.position;
    }

    publishChange("column.updated", { projectId, id: columnId });
    return column;
}

export async function deleteColumn(projectId: string, columnId: string) {
    const column = await db.query.boardColumns.findFirst({
        where: and(eq(boardColumns.id, columnId), eq(boardColumns.projectId, projectId)),
        columns: { id: true },
    });

    if (!column) {
        throw new HttpError(404, "Column not found");
    }

    const [{ value: issueCount }] = await db.select({ value: count() }).from(issues).where(eq(issues.columnId, columnId));

    if (issueCount > 0) {
        throw new HttpError(409, "Move the issues before deleting the column");
    }

    await db.delete(boardColumns).where(eq(boardColumns.id, columnId));
    publishChange("column.deleted", { projectId, id: columnId });
}
