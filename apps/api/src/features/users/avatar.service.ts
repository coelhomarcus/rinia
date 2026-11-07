import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { storedAvatarOwner } from "@rinia/shared";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { users } from "../../db/schema";
import { HttpError } from "../../lib/http-error";
import { toPublicUser } from "../auth/auth.service";
import { avatarFilePath, inspectUpload } from "../files/files.storage";

function jpegType(contentType: string) {
    const type = contentType.split(";")[0]?.trim().toLowerCase().replace("image/jpg", "image/jpeg") ?? "";
    if (type !== "image/jpeg") throw new HttpError(400, "Use a JPEG image");
    return type;
}

/** Replaces this user's photo. The cropper sends a JPEG, and the path's `v` busts the browser cache. */
export async function saveAvatar(userId: string, bytes: Buffer, contentType: string) {
    inspectUpload({ filename: "avatar.jpg", contentType: jpegType(contentType), bytes });
    const file = avatarFilePath(userId);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
    const avatarUrl = `/api/users/${userId}/avatar?v=${Date.now()}`;
    const [user] = await db.update(users).set({ avatarUrl, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
    if (!user) throw new HttpError(404, "User not found");
    return toPublicUser(user);
}

/** Clears the photo. Bytes we stored are removed; an external URL is only forgotten. */
export async function clearAvatar(userId: string) {
    const current = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { avatarUrl: true } });
    if (!current) throw new HttpError(404, "User not found");
    const owner = current.avatarUrl ? storedAvatarOwner(current.avatarUrl) : null;
    if (owner && owner.toLowerCase() === userId.toLowerCase()) await unlink(avatarFilePath(userId)).catch(() => undefined);
    const [user] = await db.update(users).set({ avatarUrl: null, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
    if (!user) throw new HttpError(404, "User not found");
    return toPublicUser(user);
}
