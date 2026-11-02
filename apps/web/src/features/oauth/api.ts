import type { ApiTokenAccess } from "@rinia/shared";
import { apiClient } from "@/lib/api-client";

/** An app's request to sign in with Rinia, as it arrives in the consent page's address. */
export interface ConsentRequest {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    state?: string;
    scope?: string;
    resource?: string;
}

export interface ConsentDescription {
    clientName: string | null;
    redirectHost: string;
    /** What the app asked for. The person can narrow `write` to `read`. */
    access: ApiTokenAccess;
}

export function readConsentRequest(params: URLSearchParams): ConsentRequest | null {
    const clientId = params.get("client_id");
    const redirectUri = params.get("redirect_uri");
    const codeChallenge = params.get("code_challenge");
    if (!clientId || !redirectUri || !codeChallenge) return null;
    return { clientId, redirectUri, codeChallenge, state: params.get("state") ?? undefined, scope: params.get("scope") ?? undefined, resource: params.get("resource") ?? undefined };
}

export function describeConsent(request: ConsentRequest) {
    const query = new URLSearchParams({ clientId: request.clientId, redirectUri: request.redirectUri, ...(request.scope ? { scope: request.scope } : {}) });
    return apiClient.get<ConsentDescription>(`/oauth/consent?${query}`);
}

/** Sends the answer and returns where to send the browser: back to the app, with a code or with a refusal. */
export function answerConsent(request: ConsentRequest, answer: { approve: boolean; access?: ApiTokenAccess }) {
    return apiClient.post<{ redirectTo: string }>("/oauth/consent", { ...request, ...answer });
}
