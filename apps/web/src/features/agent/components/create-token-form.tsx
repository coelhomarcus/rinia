import { useState, type FormEvent } from "react";
import { createApiTokenSchema } from "@rinia/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/base/buttons/button";
import { Alert } from "@/components/base/feedback/alert";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { settingsWideFieldClass } from "@/components/settings/settings-layout";
import { API_TOKENS_QUERY_KEY, createApiToken, type ApiToken } from "@/features/auth/api";
import { ApiError } from "@/lib/api-client";
import { useTranslation } from "react-i18next";

export interface CreatedToken {
    token: ApiToken;
    /** The token itself, readable only now: the server keeps just its hash. */
    secret: string;
}

/**
 * A token name and the button that creates it, the same height side by side, and whether the token may only read.
 * The list of tokens updates on its own.
 */
export function CreateTokenForm({ onCreated, placeholder }: { onCreated: (created: CreatedToken) => void; placeholder?: string }) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [name, setName] = useState("");
    const [readOnly, setReadOnly] = useState(false);
    const create = useMutation({
        mutationFn: createApiToken,
        onSuccess: (created) => {
            setName("");
            setReadOnly(false);
            queryClient.setQueryData<ApiToken[]>(API_TOKENS_QUERY_KEY, (current) => [created.token, ...(current ?? [])]);
            onCreated(created);
        },
    });
    const parsed = createApiTokenSchema.safeParse({ name, access: readOnly ? "read" : "write" });
    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (parsed.success) create.mutate(parsed.data);
    };
    return (
        <form noValidate onSubmit={submit} className="flex w-full min-w-0 flex-col gap-2">
            <div className="flex w-full items-start gap-2">
                <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={80}
                    placeholder={placeholder ?? t("agent.tokenNamePlaceholder")}
                    aria-label={t("agent.tokenName")}
                    disabled={create.isPending}
                    className={settingsWideFieldClass}
                />
                <Button type="submit" size="lg" color="secondary" isLoading={create.isPending} isDisabled={!parsed.success}>
                    {t("agent.createToken")}
                </Button>
            </div>
            <Checkbox isSelected={readOnly} onChange={setReadOnly} isDisabled={create.isPending} label={t("agent.readOnly")} hint={t("agent.readOnlyHint")} />
            {create.isError && <Alert tone="error">{create.error instanceof ApiError ? create.error.message : t("agent.couldNotCreateToken")}</Alert>}
        </form>
    );
}
