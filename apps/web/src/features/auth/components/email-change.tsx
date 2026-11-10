import { type RequestEmailChangeInput, requestEmailChangeSchema } from "@rinia/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Button } from "@/components/base/buttons/button";
import { Alert } from "@/components/base/feedback/alert";
import { ControlledInput } from "@/components/form/controlled-input";
import { ModalDialog } from "@/components/overlay/modal-dialog";
import { cancelEmailChange, EMAIL_CHANGE_QUERY_KEY, fetchPendingEmailChange, type PendingEmailChange, requestEmailChange } from "@/features/auth/api";
import { useAuthOptions } from "@/features/auth/hooks/use-auth-options";
import { ApiError } from "@/lib/api-client";
import { useTranslation } from "react-i18next";

/** The button beside the email in the profile. Hidden when the server cannot send email. */
export function ChangeEmailButton() {
    const { t } = useTranslation();
    const { data: options } = useAuthOptions();
    if (!options?.emailChange) return null;
    return (
        <ModalDialog trigger={<Button size="sm" color="secondary">{t("profile.changeEmail")}</Button>} title={t("profile.changeEmail")} description={t("profile.changeEmailDescription")}>
            {({ close }) => <ChangeEmailForm onDone={close} />}
        </ModalDialog>
    );
}

function ChangeEmailForm({ onDone }: { onDone: () => void }) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { control, handleSubmit, setError, formState } = useForm<RequestEmailChangeInput>({
        resolver: zodResolver(requestEmailChangeSchema),
        defaultValues: { newEmail: "", currentPassword: "" },
    });
    const mutation = useMutation({
        mutationFn: requestEmailChange,
        onSuccess: (pending) => {
            queryClient.setQueryData<PendingEmailChange | null>(EMAIL_CHANGE_QUERY_KEY, pending);
            onDone();
        },
        onError: (error) => setError("root", { message: error instanceof ApiError ? error.message : t("profile.couldNotChangeEmail") }),
    });
    return (
        <form
            className="flex flex-col gap-3"
            noValidate
            onSubmit={(event) => {
                // The dialog sits inside the profile form in React's tree, and a submit would reach that form too.
                event.stopPropagation();
                void handleSubmit((values) => mutation.mutate(values))(event);
            }}
        >
            <ControlledInput control={control} name="newEmail" label={t("profile.newEmail")} type="email" autoComplete="email" isRequired autoFocus />
            <ControlledInput control={control} name="currentPassword" label={t("profile.currentPassword")} type="password" autoComplete="current-password" isRequired />
            {formState.errors.root && <Alert tone="error">{formState.errors.root.message}</Alert>}
            <div className="mt-1 flex justify-end gap-2">
                <Button type="button" size="sm" color="secondary" onClick={onDone}>
                    {t("common.cancel")}
                </Button>
                <Button type="submit" size="sm" isLoading={mutation.isPending}>
                    {t("profile.sendConfirmation")}
                </Button>
            </div>
        </form>
    );
}

/** Says where the confirmation link went while the account still has its old email, with a way to call it off. */
export function PendingEmailChangeNotice() {
    const { t, i18n } = useTranslation();
    const queryClient = useQueryClient();
    const { data: options } = useAuthOptions();
    const { data: pending } = useQuery({ queryKey: EMAIL_CHANGE_QUERY_KEY, queryFn: fetchPendingEmailChange, enabled: options?.emailChange === true });
    const cancel = useMutation({
        mutationFn: cancelEmailChange,
        onSuccess: () => queryClient.setQueryData(EMAIL_CHANGE_QUERY_KEY, null),
    });
    if (!pending) return null;
    const until = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(pending.expiresAt));
    return (
        <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
                <h3 className="text-md font-medium text-primary">{t("profile.pendingEmail")}</h3>
                <p className="text-xs text-tertiary">{t("profile.pendingEmailHint", { email: pending.email, date: until })}</p>
            </div>
            <Button size="sm" color="secondary" isLoading={cancel.isPending} onClick={() => cancel.mutate()}>
                {t("profile.cancelEmailChange")}
            </Button>
        </div>
    );
}
