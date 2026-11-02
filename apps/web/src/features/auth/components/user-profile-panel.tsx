import { updateProfileSchema } from "@rinia/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { Alert } from "@/components/base/feedback/alert";
import { SettingsControl, SettingsGroup, settingsFieldClass } from "@/components/settings/settings-layout";
import { AvatarUrlPicker } from "@/components/appearance/avatar-url-picker";
import { AUTH_QUERY_KEY, updateProfile } from "@/features/auth/api";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { ApiError } from "@/lib/api-client";
import { useTranslation } from "react-i18next";

export const UserProfilePanel = () => {
    const { user } = useAuth();
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { control, handleSubmit, watch, reset, setError, formState } = useForm({
        resolver: zodResolver(updateProfileSchema),
        defaultValues: { name: user?.name ?? "", avatarUrl: user?.avatarUrl ?? "" },
    });
    const mutation = useMutation({
        mutationFn: updateProfile,
        onSuccess: (updatedUser) => {
            queryClient.setQueryData(AUTH_QUERY_KEY, updatedUser);
            reset({ name: updatedUser.name, avatarUrl: updatedUser.avatarUrl ?? "" });
        },
        onError: (error) => setError("root", { message: error instanceof ApiError ? error.message : t("profile.couldNotSave") }),
    });
    if (!user) return null;
    const previewUrl = watch("avatarUrl");
    const initials = user.name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("");

    return (
        <form noValidate onSubmit={handleSubmit((data) => mutation.mutate(data))}>
            <SettingsGroup>
                <SettingsControl title={t("profile.profilePhoto")}>
                    <Controller
                        control={control}
                        name="avatarUrl"
                        render={({ field: avatar }) => (
                            <AvatarUrlPicker value={avatar.value} initials={initials} onChange={avatar.onChange} disabled={mutation.isPending}>
                                <Avatar key={previewUrl} src={previewUrl || undefined} initials={initials} size="sm" />
                            </AvatarUrlPicker>
                        )}
                    />
                </SettingsControl>
                <SettingsControl title={t("profile.email")}>
                    <span className="truncate text-md text-secondary">{user.email}</span>
                </SettingsControl>
                <SettingsControl title={t("profile.fullName")}>
                    <Controller control={control} name="name" render={({ field: name }) => (
                        <input {...name} required disabled={mutation.isPending} aria-label={t("profile.fullName")} className={settingsFieldClass} />
                    )} />
                </SettingsControl>
                <SettingsControl title={t("profile.username")} description={t("profile.usernameHint")}>
                    <input value={user.username} disabled aria-label={t("profile.username")} className={settingsFieldClass} />
                </SettingsControl>
            </SettingsGroup>
            <div className="mt-4 flex flex-col gap-3">
                {formState.errors.root && <Alert tone="error">{formState.errors.root.message}</Alert>}
                {mutation.isSuccess && !formState.isDirty && <Alert tone="success">{t("profile.profileSaved")}</Alert>}
                <div className="flex justify-end">
                    <Button type="submit" size="sm" isLoading={mutation.isPending} isDisabled={!formState.isDirty}>
                        {t("common.saveChanges")}
                    </Button>
                </div>
            </div>
        </form>
    );
};
