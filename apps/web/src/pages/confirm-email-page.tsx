import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { Alert } from "@/components/base/feedback/alert";
import { LoadingState } from "@/components/feedback/loading-state";
import { AUTH_QUERY_KEY, confirmEmailChange, EMAIL_CHANGE_QUERY_KEY } from "@/features/auth/api";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { ApiError } from "@/lib/api-client";
import { useTranslation } from "react-i18next";

/** Opened from the link in the new inbox. Confirms at once; the token leaves the address bar before anything else. */
export const ConfirmEmailPage = () => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [token] = useState(() => window.location.hash.slice(1));
    const started = useRef(false);
    const mutation = useMutation({
        mutationFn: confirmEmailChange,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
            queryClient.setQueryData(EMAIL_CHANGE_QUERY_KEY, null);
        },
    });
    useEffect(() => {
        if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname);
        // A link works once, so React's development double-run must not send it twice.
        if (token && !started.current) {
            started.current = true;
            mutation.mutate(token);
        }
    }, [mutation, token]);

    const failure = mutation.error instanceof ApiError ? mutation.error.message : t("errors.resetLinkInvalid");
    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1 text-center">
                <h1 className="text-lg font-semibold text-primary">{t("auth.confirmEmailTitle")}</h1>
            </div>
            {!token && <Alert tone="error">{t("errors.resetLinkInvalid")}</Alert>}
            {token && (mutation.isPending || mutation.isIdle) && <LoadingState className="py-4" />}
            {mutation.isSuccess && <Alert tone="success">{t("auth.emailConfirmed", { email: mutation.data })}</Alert>}
            {mutation.isError && <Alert tone="error">{failure}</Alert>}
            <p className="text-center text-[13px] text-tertiary">
                <Link to={user ? "/settings/profile" : "/login"} className="font-semibold text-accent-primary hover:underline">
                    {user ? t("auth.backToProfile") : t("auth.backToSignIn")}
                </Link>
            </p>
        </div>
    );
};
