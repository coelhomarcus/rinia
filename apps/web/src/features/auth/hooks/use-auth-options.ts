import { useQuery } from "@tanstack/react-query";
import { AUTH_OPTIONS_QUERY_KEY, fetchAuthOptions } from "../api";

/** The server's sign-in options; they only change when it restarts with other settings. */
export function useAuthOptions() {
    return useQuery({ queryKey: AUTH_OPTIONS_QUERY_KEY, queryFn: fetchAuthOptions, staleTime: Infinity });
}
