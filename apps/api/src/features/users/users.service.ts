import { storedAvatarOwner, type Density, type Locale, type UpdateProfileInput } from "@rinia/shared";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { users } from "../../db/schema";
import { HttpError } from "../../lib/http-error";
import { toPublicUser } from "../auth/auth.service";

export async function updateProfile(userId: string, input: UpdateProfileInput) {
    if (typeof input.avatarUrl === "string") {
        const owner = storedAvatarOwner(input.avatarUrl);
        if (owner && owner.toLowerCase() !== userId.toLowerCase()) throw new HttpError(400, "Invalid avatar");
    }
    const [user] = await db
        .update(users)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();

    if (!user) {
        throw new HttpError(404, "User not found");
    }

    return toPublicUser(user);
}

export async function updateUserLocale(userId: string, locale: Locale) {
    const [user] = await db.update(users).set({ locale, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
    if (!user) throw new HttpError(404, "User not found");
    return toPublicUser(user);
}

export async function updateUserDensity(userId: string, density: Density) {
    const [user] = await db.update(users).set({ density, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
    if (!user) throw new HttpError(404, "User not found");
    return toPublicUser(user);
}
