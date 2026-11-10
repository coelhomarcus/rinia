import { REALTIME_CLIENT_HEADER, type ApiTokenAccess, type ChangePasswordInput, type CreateApiTokenInput, type ForgotPasswordInput, type LoginInput, type RegisterInput, type ResetPasswordInput, type UpdateLocaleInput, type UpdateProfileInput } from "@rinia/shared";
import { ApiError, apiClient } from "@/lib/api-client";
import { TAB_ID } from "@/lib/tab-id";

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

/** What this server offers on the sign-in page. Password recovery needs email set up on the server. */
export interface AuthOptions {
    passwordRecovery: boolean;
}

export const AUTH_OPTIONS_QUERY_KEY = ["auth", "options"] as const;

export const fetchAuthOptions = () => apiClient.get<AuthOptions>("/auth/options");

/** Answers the same whether or not the account exists. */
export const requestPasswordReset = (input: ForgotPasswordInput) => apiClient.post<void>("/auth/forgot-password", input);

export const resetPassword = (input: ResetPasswordInput) => apiClient.post<void>("/auth/reset-password", input);

/** Signs out every other session; this one keeps working. */
export const changePassword = (input: ChangePasswordInput) => apiClient.put<void>("/users/me/password", input);

export async function updateProfile(input: UpdateProfileInput): Promise<AuthUser> {
    const { user } = await apiClient.patch<{ user: AuthUser }>("/users/me", input);
    return user;
}

export async function uploadAvatar(file: File): Promise<AuthUser> {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/users/me/avatar", {
        method: "PUT",
        credentials: "include",
        headers: { [REALTIME_CLIENT_HEADER]: TAB_ID },
        body,
    });
    const data = await response.json().catch(() => undefined);
    if (!response.ok) throw new ApiError(response.status, data?.error ?? "Unexpected error", data?.fields, data?.code, data?.params, data?.fieldCodes);
    return data.user as AuthUser;
}

export async function deleteAvatar(): Promise<AuthUser> {
    const { user } = await apiClient.delete<{ user: AuthUser }>("/users/me/avatar");
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
