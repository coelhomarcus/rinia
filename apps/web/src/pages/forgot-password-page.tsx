import { type ForgotPasswordInput, forgotPasswordSchema } from "@rinia/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { Button } from "@/components/base/buttons/button";
import { Alert } from "@/components/base/feedback/alert";
import { ControlledInput } from "@/components/form/controlled-input";
import { requestPasswordReset } from "@/features/auth/api";
import { useAuthOptions } from "@/features/auth/hooks/use-auth-options";
import { ApiError } from "@/lib/api-client";
import { useTranslation } from "react-i18next";

/** Asks for a link to choose a new password. The answer reads the same whether or not the account exists. */
export const ForgotPasswordPage = () => {
    const { t } = useTranslation();
    const { data: options } = useAuthOptions();
    const { control, handleSubmit, setError, formState } = useForm<ForgotPasswordInput>({
        resolver: zodResolver(forgotPasswordSchema),
        defaultValues: { identifier: "" },
    });
    const mutation = useMutation({
        mutationFn: requestPasswordReset,
        onError: (error) => setError("root", { message: error instanceof ApiError ? error.message : t("auth.couldNotSendLink") }),
    });

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1 text-center">
                <h1 className="text-lg font-semibold text-primary">{t("auth.forgotPasswordTitle")}</h1>
                <p className="text-[13px] text-tertiary">{t("auth.forgotPasswordDescription")}</p>
            </div>

            {options?.passwordRecovery === false ? (
                <Alert tone="info">{t("auth.recoveryUnavailable")}</Alert>
            ) : mutation.isSuccess ? (
                <Alert tone="success">{t("auth.resetLinkSent")}</Alert>
            ) : (
                <form className="flex flex-col gap-3" onSubmit={handleSubmit((data) => mutation.mutate(data))} noValidate>
                    <ControlledInput control={control} name="identifier" label={t("auth.usernameOrEmail")} isRequired autoFocus />
                    {formState.errors.root && <p className="text-sm text-danger-primary">{formState.errors.root.message}</p>}
                    <Button type="submit" className="mt-1" isLoading={mutation.isPending}>
                        {t("auth.sendResetLink")}
                    </Button>
                </form>
            )}

            <p className="text-center text-[13px] text-tertiary">
                <Link to="/login" className="font-semibold text-accent-primary hover:underline">
                    {t("auth.backToSignIn")}
                </Link>
            </p>
        </div>
    );
};
