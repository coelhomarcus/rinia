import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { changePasswordSchema, updateLocaleSchema, updateProfileSchema } from "@rinia/shared";
import { z } from "zod";
import { setSessionCookie } from "../../lib/cookies";
import { HttpError } from "../../lib/http-error";
import { signToken } from "../../lib/jwt";
import { changePassword } from "../auth/password.service";
import { realtimeHub } from "../realtime/realtime.service";
import { asyncHandler } from "../../middleware/async-handler";
import { contentDisposition, readMultipart } from "../files/files.http";
import { avatarFilePath } from "../files/files.storage";
import { clearAvatar, saveAvatar } from "./avatar.service";
import { updateProfile } from "./users.service";
import { updateUserLocale } from "./users.service";

export const updateMe = asyncHandler(async (req, res) => {
    const input = updateProfileSchema.parse(req.body);
    const user = await updateProfile(req.user!.sub, input);
    res.json({ user });
});

export const uploadAvatar = asyncHandler(async (req, res) => {
    const form = await readMultipart(req);
    const field = form.get("file");
    if (!(field instanceof File)) throw new HttpError(400, "Choose a file to upload");
    const user = await saveAvatar(req.user!.sub, Buffer.from(await field.arrayBuffer()), field.type || "application/octet-stream");
    res.json({ user });
});

export const removeAvatar = asyncHandler(async (req, res) => {
    res.json({ user: await clearAvatar(req.user!.sub) });
});

/** Any signed-in person can see a photo, because it shows up outside the owner's projects. */
export const downloadAvatar = asyncHandler<{ userId: string }>(async (req, res) => {
    const file = avatarFilePath(z.string().uuid().parse(req.params.userId));
    try {
        await access(file);
    } catch {
        throw new HttpError(404, "Avatar not found");
    }
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Disposition", contentDisposition("avatar.jpg"));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=86400");
    const stream = createReadStream(file);
    stream.on("error", () => {
        if (!res.headersSent) res.status(404).json({ error: "Avatar not found" });
        else res.destroy();
    });
    stream.pipe(res);
});

export const updateLocale = asyncHandler(async (req, res) => {
    const { locale } = updateLocaleSchema.parse(req.body);
    const user = await updateUserLocale(req.user!.sub, locale);
    res.json({ user });
});

/** Changing the password signs out every other session; this one gets a fresh cookie so the person stays in. */
export const updatePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    await changePassword(req.user!.sub, currentPassword, newPassword);
    setSessionCookie(res, signToken({ sub: req.user!.sub, username: req.user!.username, isAdmin: req.user!.isAdmin }));
    // Once this browser has its new cookie, sockets reconnect: this one with the new session, the others are refused.
    res.on("finish", () => realtimeHub.closeUser(req.user!.sub, "recheck"));
    res.status(204).send();
});
