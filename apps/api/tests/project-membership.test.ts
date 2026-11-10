import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, mock, spyOn, test } from "bun:test";
import type { NextFunction, Request, Response } from "express";
import { db } from "../src/db";
import { HttpError } from "../src/lib/http-error";
import { assertProjectMembership, requireProjectMember, requireProjectOwner } from "../src/middleware/project-membership.middleware";
import { stubProjectAccess } from "./fixtures/project-membership";

afterEach(() => mock.restore());

const projectId = "project";
const owner = { id: "m1", projectId, userId: "user", role: "owner" as const, joinedAt: new Date() };
const member = { ...owner, id: "m2", role: "member" as const };

function run(handler: typeof requireProjectMember, userId = "user"): Promise<{ status: number; body?: { code?: string } }> {
    return new Promise((resolve, reject) => {
        let status = 200;
        let body: { code?: string } | undefined;
        const response = {
            status(code: number) {
                status = code;
                return this;
            },
            json(value: { code?: string }) {
                body = value;
                resolve({ status, body });
            },
        };
        const next: NextFunction = (error?: unknown) => (error ? reject(error) : resolve({ status }));
        handler({ params: { projectId }, user: { sub: userId } } as unknown as Request<{ projectId: string }>, response as unknown as Response, next);
    });
}

test("the membership check is one left join on project_members", () => {
    const source = readFileSync(join(import.meta.dir, "../src/middleware/project-membership.middleware.ts"), "utf8");
    assert.match(source, /leftJoin\(projectMembers/);
    assert.equal((source.match(/await loadProjectAccess\(/g) ?? []).length, 3);
    assert.doesNotMatch(source, /ensureProjectExists|findMembership/);
});

test("requireProjectMember looks up the project once and keeps 404 vs 403", async () => {
    const select = stubProjectAccess([]);
    const findProject = spyOn(db.query.projects, "findFirst");
    const findMember = spyOn(db.query.projectMembers, "findFirst");
    await assert.rejects(run(requireProjectMember), (error: unknown) => error instanceof HttpError && error.statusCode === 404);
    assert.equal(select.mock.calls.length, 1);
    assert.equal(findProject.mock.calls.length, 0);
    assert.equal(findMember.mock.calls.length, 0);

    stubProjectAccess([{ membership: null }]);
    const refused = await run(requireProjectMember);
    assert.equal(refused.status, 403);
    assert.equal(refused.body?.code, "errors.membershipRequired");

    stubProjectAccess([{ membership: member }]);
    assert.equal((await run(requireProjectMember)).status, 200);
});

test("requireProjectOwner permits only the owner, and still 404s a missing project", async () => {
    stubProjectAccess([{ membership: member }]);
    assert.equal((await run(requireProjectOwner)).status, 403);
    stubProjectAccess([{ membership: owner }]);
    assert.equal((await run(requireProjectOwner)).status, 200);
    stubProjectAccess([]);
    await assert.rejects(run(requireProjectOwner), (error: unknown) => error instanceof HttpError && error.statusCode === 404);
});

test("assertProjectMembership shares the same lookup", async () => {
    stubProjectAccess([]);
    await assert.rejects(assertProjectMembership(projectId, "user"), (error: unknown) => error instanceof HttpError && error.statusCode === 404);
    stubProjectAccess([{ membership: null }]);
    await assert.rejects(assertProjectMembership(projectId, "user"), (error: unknown) => error instanceof HttpError && error.statusCode === 403);
    stubProjectAccess([{ membership: member }]);
    await assertProjectMembership(projectId, "user");
});
