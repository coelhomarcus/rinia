import { type LoginInput, loginSchema } from "@rinia/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { Button } from "@/components/base/buttons/button";
import { ControlledInput } from "@/components/form/controlled-input";
import { AUTH_QUERY_KEY, login } from "@/features/auth/api";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { returnPath } from "@/features/auth/return-path";
import { ApiError } from "@/lib/api-client";
import { useTranslation } from "react-i18next";

export const LoginPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();
    const { t } = useTranslation();

    const { control, handleSubmit, setError, formState } = useForm<LoginInput>({
        resolver: zodResolver(loginSchema),
        defaultValues: { identifier: "", password: "" },
    });

    const mutation = useMutation({
        mutationFn: login,
        onSuccess: (authUser) => {
            queryClient.setQueryData(AUTH_QUERY_KEY, authUser);
            navigate(returnPath(location), { replace: true });
        },
        onError: (error) => {
            setError("root", { message: error instanceof ApiError ? error.message : t("auth.unableToSignIn") });
        },
    });

    if (user) {
        return <Navigate to={returnPath(location)} replace />;
    }

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1 text-center">
                <h1 className="text-lg font-semibold text-primary">{t("auth.signIn")}</h1>
                <p className="text-[13px] text-tertiary">{t("auth.signInContinue")}</p>
            </div>

            <form className="flex flex-col gap-3" onSubmit={handleSubmit((data) => mutation.mutate(data))} noValidate>
                <ControlledInput control={control} name="identifier" label={t("auth.usernameOrEmail")} isRequired autoFocus />
                <ControlledInput control={control} name="password" label={t("auth.password")} type="password" isRequired />

                {formState.errors.root && <p className="text-sm text-danger-primary">{formState.errors.root.message}</p>}

                <Button type="submit" className="mt-1" isLoading={mutation.isPending}>
                    {t("auth.signIn")}
                </Button>
            </form>

            <p className="text-center text-[13px] text-tertiary">
                {t("auth.noAccount")}{" "}
                <Link to="/register" state={location.state} className="font-semibold text-accent-primary hover:underline">
                    {t("auth.createAccount")}
                </Link>
            </p>
        </div>
    );
};
