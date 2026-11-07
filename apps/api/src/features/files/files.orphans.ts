import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { storedAvatarOwner, storedFileId, storedFileIds, type EntityIcon } from "@rinia/shared";
import { inArray } from "drizzle-orm";
import { db } from "../../db";
import { files, issueComments, issueDescriptionRevisions, issues, projectDocuments, projects, users } from "../../db/schema";
import { documentRooms } from "../documents/document-rooms";
import { avatarFilePath, FILE_RETENTION_MS, isUploadId, storedFilePath, uploadDirectory } from "./files.storage";
import { sweepExpiredUploads } from "./files.uploads";

/** A file with no issue, and not mentioned anywhere, once it is old enough to no longer be an upload in progress. */
export function unreferencedFileIds(
    rows: { id: string; issueId: string | null; createdAt: Date }[],
    referenced: ReadonlySet<string>,
    cutoff: Date,
) {
    return rows.filter((file) => !file.issueId && file.createdAt < cutoff && !referenced.has(file.id.toLowerCase())).map((file) => file.id);
}

function keep(ids: Set<string>, id: string | null) {
    if (id) ids.add(id.toLowerCase());
}

function keepDocument(ids: Set<string>, document: { content?: unknown[] } | null | undefined) {
    for (const id of storedFileIds(document)) keep(ids, id);
}

function keepIcon(ids: Set<string>, icon: EntityIcon | null | undefined) {
    if (icon?.type === "image") keep(ids, storedFileId(icon.url));
}

function keepText(ids: Set<string>, text: string) {
    for (const match of text.matchAll(/\/api\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi)) keep(ids, match[1]);
}

async function referencedIds() {
    const ids = new Set<string>();
    const [issueRows, commentRows, revisionRows, documentRows, projectRows, openPages] = await Promise.all([
        db.select({ descriptionJson: issues.descriptionJson }).from(issues),
        db.select({ contentJson: issueComments.contentJson }).from(issueComments),
        db.select({ contentJson: issueDescriptionRevisions.contentJson }).from(issueDescriptionRevisions),
        db.select({ contentJson: projectDocuments.contentJson, iconAppearance: projectDocuments.iconAppearance }).from(projectDocuments),
        db.select({ iconAppearance: projects.iconAppearance, pageContent: projects.pageContent }).from(projects),
        documentRooms.referencedFileIds(),
    ]);
    for (const row of issueRows) keepDocument(ids, row.descriptionJson);
    for (const row of commentRows) keepDocument(ids, row.contentJson);
    for (const row of revisionRows) keepDocument(ids, row.contentJson);
    for (const row of documentRows) {
        keepDocument(ids, row.contentJson);
        keepIcon(ids, row.iconAppearance);
    }
    for (const row of projectRows) {
        keepIcon(ids, row.iconAppearance);
        keepText(ids, row.pageContent);
    }
    for (const id of openPages) keep(ids, id);
    return ids;
}

async function removeLooseFiles(cutoffMs: number, kept: ReadonlySet<string>) {
    const entries = await readdir(uploadDirectory(), { withFileTypes: true }).catch(() => []);
    let removed = 0;
    await Promise.all(entries.map(async (entry) => {
        if (!entry.isFile() || !isUploadId(entry.name) || kept.has(entry.name.toLowerCase())) return;
        const info = await stat(path.join(uploadDirectory(), entry.name)).catch(() => null);
        if (!info || info.mtimeMs >= cutoffMs) return;
        await unlink(storedFilePath(entry.name)).catch(() => undefined);
        removed += 1;
    }));
    return removed;
}

async function removeLooseAvatars(cutoffMs: number) {
    const directory = path.join(uploadDirectory(), "avatars");
    const [entries, people] = await Promise.all([
        readdir(directory).catch(() => []),
        db.select({ avatarUrl: users.avatarUrl }).from(users),
    ]);
    const kept = new Set<string>();
    for (const person of people) {
        const owner = person.avatarUrl ? storedAvatarOwner(person.avatarUrl) : null;
        if (owner) kept.add(owner.toLowerCase());
    }
    let removed = 0;
    await Promise.all(entries.map(async (name) => {
        if (!isUploadId(name) || kept.has(name.toLowerCase())) return;
        const info = await stat(path.join(directory, name)).catch(() => null);
        if (!info || info.mtimeMs >= cutoffMs) return;
        await unlink(avatarFilePath(name)).catch(() => undefined);
        removed += 1;
    }));
    return removed;
}

/** Deletes stored files that nothing points at, once they are older than a day. */
export async function cleanupOrphanFiles(now = new Date()) {
    const cutoff = new Date(now.getTime() - FILE_RETENTION_MS);
    const referenced = await referencedIds();
    const rows = await db.select({ id: files.id, issueId: files.issueId, createdAt: files.createdAt }).from(files);
    const orphans = unreferencedFileIds(rows.filter((file) => file.createdAt < cutoff), referenced, cutoff);
    if (orphans.length) await db.delete(files).where(inArray(files.id, orphans));
    await Promise.all(orphans.map((id) => unlink(storedFilePath(id)).catch(() => undefined)));
    const dropping = new Set(orphans.map((id) => id.toLowerCase()));
    const known = new Set(rows.flatMap((row) => (dropping.has(row.id.toLowerCase()) ? [] : [row.id.toLowerCase()])));
    const [partials, loose, avatars] = await Promise.all([
        sweepExpiredUploads(now.getTime()),
        removeLooseFiles(cutoff.getTime(), known),
        removeLooseAvatars(cutoff.getTime()),
    ]);
    return { files: orphans.length, partials, loose, avatars };
}
