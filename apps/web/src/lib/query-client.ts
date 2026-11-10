import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api-client";

/** Client errors will not succeed on retry, except timeouts and rate limits. */
export function shouldRetryQuery(failureCount: number, error: unknown) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) return false;
    return failureCount < 2;
}

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: shouldRetryQuery,
            staleTime: 30_000,
        },
        mutations: {
            retry: false,
        },
    },
});
