import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { changePasswordSchema, requestEmailChangeSchema, updateDensitySchema, updateLocaleSchema, updateProfileSchema } from "@rinia/shared";
import { z } from "zod";
import { appBaseUrl } from "../../lib/app-url";
import { HttpError } from "../../lib/http-error";
import { changePassword } from "../auth/password.service";
import { cancelEmailChange, pendingEmailChange, requestEmailChange } from "./email-change.service";
import { asyncHandler } from "../../middleware/async-handler";
import { contentDisposition, readMultipart } from "../files/files.http";
import { avatarFilePath } from "../files/files.storage";
import { clearAvatar, saveAvatar } from "./avatar.service";
import { updateProfile } from "./users.service";
import { updateUserDensity, updateUserLocale } from "./users.service";

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

export const updateDensity = asyncHandler(async (req, res) => {
    const { density } = updateDensitySchema.parse(req.body);
    const user = await updateUserDensity(req.user!.sub, density);
    res.json({ user });
});

/** Changing the password revokes every other session; this browser stays signed in. */
export const updatePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    await changePassword(req.user!.sub, currentPassword, newPassword, req.user!.sid);
    res.status(204).send();
});

export const startEmailChange = asyncHandler(async (req, res) => {
    const input = requestEmailChangeSchema.parse(req.body);
    res.json({ pending: await requestEmailChange(req.user!.sub, input, appBaseUrl(req)) });
});

export const getEmailChange = asyncHandler(async (req, res) => {
    res.json({ pending: await pendingEmailChange(req.user!.sub) });
});

export const deleteEmailChange = asyncHandler(async (req, res) => {
    await cancelEmailChange(req.user!.sub);
    res.status(204).send();
});
