import { useState } from "react";
import { DeleteOutline, KeyOutline } from "@makeplane/propel/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Alert } from "@/components/base/feedback/alert";
import { ConfirmDialog } from "@/components/overlay/confirm-dialog";
import { Link } from "react-router";
import { SettingsControl, SettingsGroup, SettingsItemRow, SettingsRowIcon } from "@/components/settings/settings-layout";
import { API_TOKENS_QUERY_KEY, fetchApiTokens, revokeApiToken, type ApiToken } from "@/features/auth/api";
import { CopyField } from "@/features/integrations/components/copy-field";
import { ApiError } from "@/lib/api-client";
import { urls } from "@/lib/urls";
import { useTranslation } from "react-i18next";
import { CreateTokenForm } from "./create-token-form";

/** Personal tokens for AI tools and scripts. A new token is shown once, right after it is created. */
export const ApiTokensPanel = () => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { data: tokens, isError } = useQuery({ queryKey: API_TOKENS_QUERY_KEY, queryFn: fetchApiTokens });
    /** The token just created, readable until it is dismissed or revoked. */
    const [fresh, setFresh] = useState<{ id: string; secret: string } | null>(null);
    const secret = fresh?.secret ?? null;

    const revoke = useMutation({
        mutationFn: revokeApiToken,
        onSuccess: (_result, tokenId) => {
            queryClient.setQueryData<ApiToken[]>(API_TOKENS_QUERY_KEY, (current) => current?.filter((token) => token.id !== tokenId));
            // A revoked token no longer works, so it is not offered for copying either.
            setFresh((current) => (current?.id === tokenId ? null : current));
        },
    });

    const failure = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

    return (
        <>
            <SettingsGroup>
                <SettingsControl stacked title={t("agent.tokenName")} description={t("agent.tokenNameHint")}>
                    <CreateTokenForm onCreated={(created) => setFresh({ id: created.token.id, secret: created.secret })} />
                </SettingsControl>

                {secret && (
                    <div className="flex flex-col gap-3 py-4">
                        <div>
                            <h3 className="text-md font-medium text-primary">{t("agent.newToken")}</h3>
                            <p className="text-xs text-tertiary">{t("agent.newTokenHint")}</p>
                        </div>
                        <CopyField value={secret} label={t("agent.newToken")} />
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-[13px] text-tertiary">
                                {t("agent.useInIntegrations")}{" "}
                                <Link to={urls.integrations()} className="text-primary underline decoration-subtle underline-offset-2 hover:decoration-current">
                                    {t("nav.allIntegrations")}
                                </Link>
                                .
                            </p>
                            <Button size="sm" color="secondary" onClick={() => setFresh(null)}>
                                {t("agent.hideToken")}
                            </Button>
                        </div>
                    </div>
                )}
            </SettingsGroup>

            <SettingsGroup title={t("agent.yourTokens")}>
                {(revoke.isError || isError) && (
                    <div className="py-4">
                        <Alert tone="error">{revoke.isError ? failure(revoke.error, t("agent.couldNotRevokeToken")) : t("agent.couldNotLoadTokens")}</Alert>
                    </div>
                )}
                {tokens?.length === 0 && <p className="flex min-h-15 items-center text-[13px] text-tertiary">{t("agent.noApiTokens")}</p>}
                {tokens?.map((token) => <ApiTokenRow key={token.id} token={token} isRevoking={revoke.isPending && revoke.variables === token.id} onRevoke={() => revoke.mutate(token.id)} />)}
            </SettingsGroup>
        </>
    );
};

function ApiTokenRow({ token, isRevoking, onRevoke }: { token: ApiToken; isRevoking: boolean; onRevoke: () => void }) {
    const { t, i18n } = useTranslation();
    const date = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(value));
    return (
        <SettingsItemRow
            leading={<SettingsRowIcon icon={KeyOutline} />}
            title={token.name}
            description={
                <>
                    <span className="font-mono">{token.prefix}…</span>
                    {" · "}
                    {t("agent.tokenCreatedOn", { date: date(token.createdAt) })}
                    {" · "}
                    {token.lastUsedAt ? t("agent.tokenLastUsed", { date: date(token.lastUsedAt) }) : t("agent.tokenNeverUsed")}
                </>
            }
        >
            <ConfirmDialog
                trigger={<ButtonUtility icon={DeleteOutline} size="sm" color="tertiary" tooltip={t("agent.revokeTokenNamed", { name: token.name })} isDisabled={isRevoking} />}
                title={t("agent.revokeToken")}
                description={t("agent.revokeTokenDescription", { name: token.name })}
                confirmLabel={t("agent.revokeToken")}
                isPending={isRevoking}
                onConfirm={onRevoke}
            />
        </SettingsItemRow>
    );
}
