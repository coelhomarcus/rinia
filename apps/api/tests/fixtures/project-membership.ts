import { spyOn } from "bun:test";
import { db } from "../../src/db";
import { projects } from "../../src/db/schema";

type MembershipRow = { issueKey?: string; membership: { id?: string | null; role?: string } | null };

/** A joined select that finds nothing, however many joins it chains. */
const nothingJoined = (): object => ({ innerJoin: nothingJoined, leftJoin: nothingJoined, where: async () => [] });

/**
 * Answers the one LEFT JOIN `requireProjectPermission`, `assertProjectAccess` and `assertProjectMembership` run.
 * An empty list is a missing project; `membership: null` is a project the user does not belong to. Other selects
 * become subqueries (a plain `where`) or find nothing (after a join).
 */
export function stubProjectAccess(rows: MembershipRow[] | (() => MembershipRow[])) {
    const result = () => (typeof rows === "function" ? rows() : rows);
    return spyOn(db, "select").mockImplementation((() => ({
        from: (table: unknown) => ({
            leftJoin: table === projects ? () => ({ where: async () => result() }) : nothingJoined,
            innerJoin: nothingJoined,
            where: (condition: unknown) => condition,
        }),
    })) as never);
}

/** A caller with `role` in the project, or outside it with `null`. */
export const stubRole = (role: string | null) => stubProjectAccess([{ membership: role ? { id: "membership", role } : null }]);
