import { type RegisterInput, registerSchema } from "@rinia/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { Button } from "@/components/base/buttons/button";
import { ControlledInput } from "@/components/form/controlled-input";
import { AUTH_QUERY_KEY, register } from "@/features/auth/api";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { returnPath } from "@/features/auth/return-path";
import { ApiError } from "@/lib/api-client";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/i18n/language-provider";

export const RegisterPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();
    const { t } = useTranslation();
    const { locale } = useLanguage();

    type RegisterFormValues = Omit<RegisterInput, "locale"> & { locale?: RegisterInput["locale"] };
    const { control, handleSubmit, setError, formState } = useForm<RegisterFormValues, any, RegisterInput>({
        resolver: zodResolver(registerSchema),
        defaultValues: { name: "", username: "", email: "", password: "", specialCode: "", locale },
    });

    const mutation = useMutation({
        mutationFn: register,
        onSuccess: (authUser) => {
            queryClient.setQueryData(AUTH_QUERY_KEY, authUser);
            void navigate(returnPath(location), { replace: true });
        },
        onError: (error) => {
            setError("root", { message: error instanceof ApiError ? error.message : t("auth.unableToCreateAccount") });
        },
    });

    if (user) {
        return <Navigate to={returnPath(location)} replace />;
    }

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1 text-center">
                <h1 className="text-lg font-semibold text-primary">{t("auth.createAccount")}</h1>
                <p className="text-[13px] text-tertiary">{t("auth.registrationRequiresCode")}</p>
            </div>

            <form className="flex flex-col gap-3" onSubmit={handleSubmit((data) => mutation.mutate({ ...data, locale }))} noValidate>
                <ControlledInput control={control} name="name" label={t("auth.name")} isRequired autoFocus />
                <ControlledInput control={control} name="username" label={t("auth.username")} isRequired hint={t("auth.usernameHint")} />
                <ControlledInput control={control} name="email" label={t("auth.email")} type="email" isRequired />
                <ControlledInput control={control} name="password" label={t("auth.password")} type="password" isRequired hint={t("auth.passwordHint")} />
                <ControlledInput control={control} name="specialCode" label={t("auth.specialCode")} isRequired />

                {formState.errors.root && <p className="text-sm text-danger-primary">{formState.errors.root.message}</p>}

                <Button type="submit" className="mt-1" isLoading={mutation.isPending}>
                    {t("auth.createAccount")}
                </Button>
            </form>

            <p className="text-center text-[13px] text-tertiary">
                {t("auth.alreadyHaveAccount")}{" "}
                <Link to="/login" state={location.state} className="font-semibold text-accent-primary hover:underline">
                    {t("auth.signIn")}
                </Link>
            </p>
        </div>
    );
};
