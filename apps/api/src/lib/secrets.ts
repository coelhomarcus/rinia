import { createHash, timingSafeEqual } from "node:crypto";

/** Compares two secrets in constant time. Both sides are hashed first so unequal lengths cannot leak. */
export function secretsEqual(left: string, right: string) {
    const digest = (value: string) => createHash("sha256").update(value).digest();
    return timingSafeEqual(digest(left), digest(right));
}
