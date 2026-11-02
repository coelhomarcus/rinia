import type { ApiTokenAccess, CreateApiTokenInput, LoginInput, RegisterInput, UpdateLocaleInput, UpdateProfileInput } from "@rinia/shared";
import { apiClient } from "@/lib/api-client";

export interface AuthUser {
    id: string;
    name: string;
    username: string;
    email: string;
    avatarUrl: string | null;
    locale: "pt-BR" | "en";
    isAdmin: boolean;
    createdAt: string;
    updatedAt: string;
}

export const AUTH_QUERY_KEY = ["auth", "me"] as const;

export async function fetchMe(): Promise<AuthUser> {
    const { user } = await apiClient.get<{ user: AuthUser }>("/auth/me");
    return user;
}

export async function login(input: LoginInput): Promise<AuthUser> {
    const { user } = await apiClient.post<{ user: AuthUser }>("/auth/login", input);
    return user;
}

export async function register(input: RegisterInput): Promise<AuthUser> {
    const { user } = await apiClient.post<{ user: AuthUser }>("/auth/register", input);
    return user;
}

export function logout(): Promise<void> {
    return apiClient.post<void>("/auth/logout");
}

export async function updateProfile(input: UpdateProfileInput): Promise<AuthUser> {
    const { user } = await apiClient.patch<{ user: AuthUser }>("/users/me", input);
    return user;
}

export async function updateLocale(locale: UpdateLocaleInput["locale"]): Promise<AuthUser> {
    const { user } = await apiClient.patch<{ user: AuthUser }>("/users/me/locale", { locale });
    return user;
}

export interface ApiToken {
    id: string;
    name: string;
    /** The token's first characters, enough to tell tokens apart. */
    prefix: string;
    access: ApiTokenAccess;
    /** Handed to an app when someone signed in to it with Rinia, rather than made on this page. */
    oauth: boolean;
    lastUsedAt: string | null;
    createdAt: string;
}

export const API_TOKENS_QUERY_KEY = ["api-tokens"] as const;

export async function fetchApiTokens(): Promise<ApiToken[]> {
    const { tokens } = await apiClient.get<{ tokens: ApiToken[] }>("/api-tokens");
    return tokens;
}

/** The full token is in `secret`, and this response is the only place it ever appears. */
export function createApiToken(input: CreateApiTokenInput): Promise<{ token: ApiToken; secret: string }> {
    return apiClient.post<{ token: ApiToken; secret: string }>("/api-tokens", input);
}

export function revokeApiToken(tokenId: string): Promise<void> {
    return apiClient.delete<void>(`/api-tokens/${tokenId}`);
}
