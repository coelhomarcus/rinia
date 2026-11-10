import { useEffect, useState } from "react";
import { type ResetPasswordFormInput, resetPasswordFormSchema } from "@rinia/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/base/buttons/button";
import { Alert } from "@/components/base/feedback/alert";
import { ControlledInput } from "@/components/form/controlled-input";
import { AUTH_QUERY_KEY, resetPassword } from "@/features/auth/api";
import { ApiError } from "@/lib/api-client";
import { useTranslation } from "react-i18next";

type FormValues = ResetPasswordFormInput;

/** Chooses a new password with the link from the email. The token comes in the fragment and leaves the address bar at once. */
export const ResetPasswordPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [token] = useState(() => window.location.hash.slice(1));
    useEffect(() => {
        if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname);
    }, []);

    const { control, handleSubmit, setError, formState } = useForm<FormValues>({
        resolver: zodResolver(resetPasswordFormSchema),
        defaultValues: { password: "", confirm: "" },
    });
    const mutation = useMutation({
        mutationFn: (values: FormValues) => resetPassword({ token, password: values.password }),
        onSuccess: () => {
            // Every session ended with the old password, this browser's included.
            queryClient.setQueryData(AUTH_QUERY_KEY, null);
            navigate("/login", { replace: true, state: { notice: "passwordReset" } });
        },
        onError: (error) => setError("root", { message: error instanceof ApiError ? error.message : t("auth.couldNotResetPassword") }),
    });

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1 text-center">
                <h1 className="text-lg font-semibold text-primary">{t("auth.resetPasswordTitle")}</h1>
                <p className="text-[13px] text-tertiary">{t("auth.resetPasswordDescription")}</p>
            </div>

            {token ? (
                <form className="flex flex-col gap-3" onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
                    <ControlledInput control={control} name="password" label={t("auth.newPassword")} type="password" hint={t("auth.passwordHint")} autoComplete="new-password" isRequired autoFocus />
                    <ControlledInput control={control} name="confirm" label={t("auth.confirmPassword")} type="password" autoComplete="new-password" isRequired />
                    {formState.errors.root && <p className="text-sm text-danger-primary">{formState.errors.root.message}</p>}
                    <Button type="submit" className="mt-1" isLoading={mutation.isPending}>
                        {t("auth.saveNewPassword")}
                    </Button>
                </form>
            ) : (
                <Alert tone="error">{t("errors.resetLinkInvalid")}</Alert>
            )}

            <p className="text-center text-[13px] text-tertiary">
                <Link to="/forgot-password" className="font-semibold text-accent-primary hover:underline">
                    {t("auth.requestNewLink")}
                </Link>
            </p>
        </div>
    );
};
