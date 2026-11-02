import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Alert } from "@/components/base/feedback/alert";
import { Skeleton } from "@/components/base/feedback/skeleton";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { answerConsent, describeConsent, readConsentRequest } from "@/features/oauth/api";
import { ApiError } from "@/lib/api-client";
import { useTranslation } from "react-i18next";

/**
 * Where an MCP client such as Claude sends someone to sign in with Rinia. They see which app asks and where it will
 * send them back, may narrow it to reading only, and allow or deny. Either way the browser goes back to the app.
 */
export function OAuthConsentPage() {
    const { t } = useTranslation();
    const { user } = useAuth();
    const [params] = useSearchParams();
    const request = readConsentRequest(params);
    const [readOnly, setReadOnly] = useState(false);
    const description = useQuery({ queryKey: ["oauth-consent", params.toString()], queryFn: () => describeConsent(request!), enabled: !!request, retry: false });
    const answer = useMutation({
        mutationFn: (approve: boolean) => answerConsent(request!, { approve, access: readOnly ? "read" : undefined }),
        onSuccess: ({ redirectTo }) => window.location.assign(redirectTo),
    });

    const failure = description.error ?? answer.error;
    if (!request || failure) {
        return (
            <div className="flex flex-col gap-3">
                <h1 className="text-lg font-semibold text-primary">{t("oauth.invalidTitle")}</h1>
                <Alert tone="error">{failure instanceof ApiError ? failure.message : t("oauth.invalidRequest")}</Alert>
            </div>
        );
    }
    if (!description.data) {
        return (
            <div className="space-y-4" role="status" aria-label={t("common.loading")}>
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-9 w-full" />
            </div>
        );
    }

    const { clientName, redirectHost, access } = description.data;
    const app = clientName ?? redirectHost;
    const pending = answer.isPending || answer.isSuccess;
    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1 text-center">
                <h1 className="text-lg font-semibold text-primary">{t("oauth.title", { app })}</h1>
                <p className="text-[13px] text-tertiary">{t("oauth.signedInAs", { username: user?.username ?? "" })}</p>
            </div>
            <div className="flex flex-col gap-2 rounded-md border border-subtle bg-layer-1 p-3 text-[13px] text-secondary">
                <p>{access === "read" ? t("oauth.asksRead", { app }) : t("oauth.asksWrite", { app })}</p>
                <p className="text-tertiary">{t("oauth.returnsTo", { host: redirectHost })}</p>
                {access === "write" && <Checkbox isSelected={readOnly} onChange={setReadOnly} isDisabled={pending} label={t("oauth.readOnly")} hint={t("oauth.readOnlyHint")} />}
            </div>
            <div className="flex gap-2">
                <Button className="flex-1" color="secondary" isDisabled={pending} onClick={() => answer.mutate(false)}>
                    {t("oauth.deny")}
                </Button>
                <Button className="flex-1" isLoading={pending} onClick={() => answer.mutate(true)}>
                    {t("oauth.allow")}
                </Button>
            </div>
            <p className="text-center text-xs text-placeholder">{t("oauth.revokeHint")}</p>
        </div>
    );
}
