import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, use } from "react";
import { ApiError } from "@/lib/api-client";
import { AUTH_QUERY_KEY, type AuthUser, fetchMe } from "../api";

interface AuthContextValue {
    user: AuthUser | null;
    isLoading: boolean;
    /** The session could not be checked because the server was unreachable, as when the app opens offline. */
    unreachable: boolean;
    retry: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchMeOrNull(): Promise<AuthUser | null> {
    try {
        return await fetchMe();
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
            return null;
        }
        throw error;
    }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: AUTH_QUERY_KEY,
        queryFn: fetchMeOrNull,
        retry: false,
        staleTime: Infinity,
    });
    // A failed fetch never reached the server, and a 5xx (often the proxy while the app restarts) says nothing about
    // the session either; neither should send someone to the sign-in page.
    const unreachable = !data && !!error && (!(error instanceof ApiError) || error.status >= 500);

    return <AuthContext value={{ user: data ?? null, isLoading, unreachable, retry: () => void refetch() }}>{children}</AuthContext>;
};

export const useAuth = (): AuthContextValue => {
    const context = use(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
