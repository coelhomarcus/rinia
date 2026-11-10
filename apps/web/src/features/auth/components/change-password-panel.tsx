import { type ChangePasswordFormInput, changePasswordFormSchema } from "@rinia/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/base/buttons/button";
import { Alert } from "@/components/base/feedback/alert";
import { SettingsControl, SettingsGroup, settingsFieldClass } from "@/components/settings/settings-layout";
import { changePassword, SESSIONS_QUERY_KEY } from "@/features/auth/api";
import { ApiError } from "@/lib/api-client";
import { translateValidationMessage } from "@/i18n/validation";
import { useTranslation } from "react-i18next";

type FormValues = ChangePasswordFormInput;

const FIELDS = [
    { name: "currentPassword", label: "profile.currentPassword", autoComplete: "current-password" },
    { name: "newPassword", label: "profile.newPassword", autoComplete: "new-password", hint: "auth.passwordHint" },
    { name: "confirm", label: "profile.confirmNewPassword", autoComplete: "new-password" },
] as const;

/** Changes the password after checking the current one. Other devices are signed out; this one stays in. */
export function ChangePasswordPanel() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { control, handleSubmit, reset, setError, formState } = useForm<FormValues>({
        resolver: zodResolver(changePasswordFormSchema),
        defaultValues: { currentPassword: "", newPassword: "", confirm: "" },
    });
    const mutation = useMutation({
        mutationFn: ({ currentPassword, newPassword }: FormValues) => changePassword({ currentPassword, newPassword }),
        onSuccess: () => {
            reset();
            // Every other session was revoked with the old password.
            void queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
        },
        onError: (error) => setError("root", { message: error instanceof ApiError ? error.message : t("profile.couldNotChangePassword") }),
    });

    return (
        <form noValidate onSubmit={handleSubmit((values) => mutation.mutate(values))} className="mb-12">
            <SettingsGroup title={t("profile.password")} description={t("profile.passwordDescription")}>
                {FIELDS.map((field) => (
                    <Controller
                        key={field.name}
                        control={control}
                        name={field.name}
                        render={({ field: input, fieldState }) => (
                            <SettingsControl title={t(field.label)} description={translateValidationMessage(fieldState.error?.message, t) ?? ("hint" in field ? t(field.hint) : undefined)}>
                                <input
                                    {...input}
                                    type="password"
                                    autoComplete={field.autoComplete}
                                    disabled={mutation.isPending}
                                    aria-label={t(field.label)}
                                    aria-invalid={fieldState.error ? true : undefined}
                                    className={`${settingsFieldClass} ${fieldState.error ? "border-danger-primary" : ""}`}
                                />
                            </SettingsControl>
                        )}
                    />
                ))}
            </SettingsGroup>
            <div className="mt-4 flex flex-col gap-3">
                {formState.errors.root && <Alert tone="error">{formState.errors.root.message}</Alert>}
                {mutation.isSuccess && !formState.isDirty && <Alert tone="success">{t("profile.passwordChanged")}</Alert>}
                <div className="flex justify-end">
                    <Button type="submit" size="sm" isLoading={mutation.isPending} isDisabled={!formState.isDirty}>
                        {t("profile.changePassword")}
                    </Button>
                </div>
            </div>
        </form>
    );
}
