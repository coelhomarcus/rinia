import { describe, expect, test } from "bun:test";
import { entityIconSchema, storedAvatarOwner, updateProfileSchema } from "@rinia/shared";

const id = "11111111-1111-4111-8111-111111111111";

describe("stored image urls", () => {
    test("an icon image can be a stored file or an external url", () => {
        expect(entityIconSchema.safeParse({ type: "image", url: `/api/files/${id}` }).success).toBe(true);
        expect(entityIconSchema.safeParse({ type: "image", url: "https://cdn.example/a.png" }).success).toBe(true);
        expect(entityIconSchema.safeParse({ type: "image", url: "blob:http://localhost/x" }).success).toBe(false);
    });

    test("a profile photo can be a stored avatar, and an empty field clears it", () => {
        expect(updateProfileSchema.parse({ avatarUrl: `/api/users/${id}/avatar?v=1` }).avatarUrl).toBe(`/api/users/${id}/avatar?v=1`);
        expect(updateProfileSchema.parse({ avatarUrl: "" }).avatarUrl).toBeNull();
        expect(updateProfileSchema.safeParse({ avatarUrl: `/api/users/${id}/avatar` }).success).toBe(false);
        expect(storedAvatarOwner(`/api/users/${id}/avatar?v=9`)).toBe(id);
        expect(storedAvatarOwner("https://cdn.example/a.png")).toBeNull();
    });
});
