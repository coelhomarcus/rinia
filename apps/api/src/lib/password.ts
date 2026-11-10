/**
 * Verified when no user exists, so that path still runs argon2id. A match still fails login because there is no account.
 */
const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=2,p=1$4fnlZ/qbjXskErMXKNVCXOr/liN6FYFZdl+u/grhpOA$8rtU8tWIP+aaYIaRQBKPOUQDfYWJdz9WUJTAARJi+7c";

/** A stored hash from bcryptjs or Bun's bcrypt, which login rewrites to argon2id. */
export function isLegacyBcryptHash(hash: string) {
    return hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$");
}

export function hashPassword(password: string): Promise<string> {
    return Bun.password.hash(password, { algorithm: "argon2id" });
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
    return Bun.password.verify(password, hash);
}

/** Runs argon2id even when there is no stored hash, so a missing user is not a faster 401. */
export function verifyLoginPassword(password: string, storedHash: string | undefined) {
    return verifyPassword(password, storedHash ?? DUMMY_PASSWORD_HASH);
}
