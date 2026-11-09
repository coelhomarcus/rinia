import { POSITION_GAP, positionsTooClose } from "@rinia/shared";
import { sql, type SQL } from "drizzle-orm";
import { db } from ".";

/**
 * The tables kept in a manual order by `position`, and what breaks a tie between two equal positions. Issues are
 * ordered across the whole project (the list and the board both sort by position, then number); columns per project.
 */
const ORDERS = {
    issues: { table: sql`"issues"`, tieBreak: sql`"number"` },
    columns: { table: sql`"board_columns"`, tieBreak: sql`"created_at", "id"` },
} satisfies Record<string, { table: SQL; tieBreak: SQL }>;

type Order = keyof typeof ORDERS;
type Neighbours = { position: number; before: number | null; after: number | null };

/**
 * Spreads the project's order `POSITION_GAP` apart again when one of `movedIds`, just given a position, sits too close
 * to a neighbour for another drop to fit between them. The order stays as it was. Soft-deleted rows keep their place
 * in it, so a restored issue comes back where it was. Returns the new position of every row when it respaced, and null
 * when it did not need to.
 *
 * The caller already publishes the moved row's change over realtime, and that event makes every open list reload the
 * whole project's order, so the respaced positions reach other clients with it.
 */
async function respaceIfCrowded(order: Order, projectId: string, movedIds: string[]): Promise<Map<string, number> | null> {
    if (movedIds.length === 0) return null;
    const { table, tieBreak } = ORDERS[order];
    const ids = sql.join(movedIds.map((id) => sql`${id}`), sql`, `);
    const { rows } = await db.execute<Neighbours>(sql`
        SELECT moved."position",
            (SELECT max(other."position") FROM ${table} other WHERE other."project_id" = moved."project_id" AND other."id" <> moved."id" AND other."position" <= moved."position") AS "before",
            (SELECT min(other."position") FROM ${table} other WHERE other."project_id" = moved."project_id" AND other."id" <> moved."id" AND other."position" >= moved."position") AS "after"
        FROM ${table} moved
        WHERE moved."project_id" = ${projectId} AND moved."id" IN (${ids})
    `);
    if (!rows.some((row) => positionsTooClose(row.before, row.position) || positionsTooClose(row.position, row.after))) return null;

    return db.transaction(async (tx) => {
        // Two respacings of the same project wait for each other instead of interleaving.
        await tx.execute(sql`SELECT 1 FROM "projects" WHERE "id" = ${projectId} FOR UPDATE`);
        const { rows: respaced } = await tx.execute<{ id: string; position: number }>(sql`
            UPDATE ${table} AS target
            SET "position" = ranked."rank" * ${POSITION_GAP}
            FROM (SELECT "id", row_number() OVER (ORDER BY "position", ${tieBreak}) AS "rank" FROM ${table} WHERE "project_id" = ${projectId}) AS ranked
            WHERE target."id" = ranked."id"
            RETURNING target."id", target."position"
        `);
        return new Map(respaced.map((row) => [row.id, Number(row.position)]));
    });
}

/** Respaces the project's manual issue order when a moved issue is crowding a neighbour. See `respaceIfCrowded`. */
export function respaceIssuesIfCrowded(projectId: string, movedIds: string[]) {
    return respaceIfCrowded("issues", projectId, movedIds);
}

/** Respaces the project's board columns when a moved column is crowding a neighbour. See `respaceIfCrowded`. */
export function respaceColumnsIfCrowded(projectId: string, movedIds: string[]) {
    return respaceIfCrowded("columns", projectId, movedIds);
}
