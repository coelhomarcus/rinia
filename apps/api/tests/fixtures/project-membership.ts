import { spyOn } from "bun:test";
import { db } from "../../src/db";

type MembershipRow = { issueKey?: string; membership: { id?: string | null; role?: string } | null };

/**
 * Answers the one LEFT JOIN `requireProjectMember`, `requireProjectOwner` and `assertProjectMembership` run.
 * An empty list is a missing project; `membership: null` is a project the user does not belong to.
 */
export function stubProjectAccess(rows: MembershipRow[] | (() => MembershipRow[])) {
    const result = () => (typeof rows === "function" ? rows() : rows);
    return spyOn(db, "select").mockImplementation((() => ({
        from: () => ({
            leftJoin: () => ({
                where: async () => result(),
            }),
            innerJoin: () => ({
                where: async () => [],
            }),
            where: (condition: unknown) => condition,
        }),
    })) as never);
}
