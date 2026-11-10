import { ApiError } from "@/lib/api-client";

/** What the server said went wrong, or `fallback` for anything that is not one of its answers. */
export function errorMessage(reason: unknown, fallback: string) {
    if (reason instanceof ApiError) return reason.message;
    return fallback;
}
