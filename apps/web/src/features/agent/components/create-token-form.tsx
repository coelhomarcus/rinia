import { useState, type FormEvent } from "react";
import { API_TOKEN_EXPIRY_DAYS, createApiTokenSchema, DEFAULT_API_TOKEN_EXPIRY_DAYS } from "@rinia/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/base/buttons/button";
import { Alert } from "@/components/base/feedback/alert";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Select } from "@/components/base/select/select";
import { settingsWideFieldClass } from "@/components/settings/settings-layout";
import { API_TOKENS_QUERY_KEY, createApiToken, type ApiToken } from "@/features/auth/api";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { ApiError } from "@/lib/api-client";
import { useTranslation } from "react-i18next";

export interface CreatedToken {
    token: ApiToken;
    /** The token itself, readable only now: the server keeps just its hash. */
    secret: string;
}

const NEVER = "never";

/**
 * A token name and the button that creates it, the same height side by side, whether the token may only read, when it
 * expires and which projects it may reach. The list of tokens updates on its own.
 */
export function CreateTokenForm({ onCreated, placeholder }: { onCreated: (created: CreatedToken) => void; placeholder?: string }) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { data: projects } = useProjects();
    const [name, setName] = useState("");
    const [readOnly, setReadOnly] = useState(false);
    const [expiry, setExpiry] = useState<string>(String(DEFAULT_API_TOKEN_EXPIRY_DAYS));
    const [limited, setLimited] = useState(false);
    const [projectIds, setProjectIds] = useState<string[]>([]);
    const reset = () => {
        setName("");
        setReadOnly(false);
        setExpiry(String(DEFAULT_API_TOKEN_EXPIRY_DAYS));
        setLimited(false);
        setProjectIds([]);
    };
    const create = useMutation({
        mutationFn: createApiToken,
        onSuccess: (created) => {
            reset();
            queryClient.setQueryData<ApiToken[]>(API_TOKENS_QUERY_KEY, (current) => [created.token, ...(current ?? [])]);
            onCreated(created);
        },
    });
    const parsed = createApiTokenSchema.safeParse({ name, access: readOnly ? "read" : "write", expiresInDays: expiry === NEVER ? null : Number(expiry), projectIds: limited ? projectIds : [] });
    // Limiting to no project at all would mean every project, so a limit needs at least one.
    const canCreate = parsed.success && (!limited || projectIds.length > 0);
    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (parsed.success && canCreate) create.mutate(parsed.data);
    };
    const toggleProject = (id: string, selected: boolean) => setProjectIds((current) => (selected ? [...current, id] : current.filter((value) => value !== id)));
    return (
        <form noValidate onSubmit={submit} className="flex w-full min-w-0 flex-col gap-3">
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
                <Button type="submit" size="lg" color="secondary" isLoading={create.isPending} isDisabled={!canCreate}>
                    {t("agent.createToken")}
                </Button>
            </div>
            <Checkbox isSelected={readOnly} onChange={setReadOnly} isDisabled={create.isPending} label={t("agent.readOnly")} hint={t("agent.readOnlyHint")} />
            <div className="flex flex-col gap-2">
                <Select
                    size="sm"
                    className="w-56"
                    label={t("agent.expiry")}
                    selectedKey={expiry}
                    onSelectionChange={(value) => setExpiry(String(value ?? DEFAULT_API_TOKEN_EXPIRY_DAYS))}
                    isDisabled={create.isPending}
                    items={[...API_TOKEN_EXPIRY_DAYS.map((days) => ({ id: String(days), label: t("agent.expiryDays", { count: days }) })), { id: NEVER, label: t("agent.expiryNever") }]}
                >
                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                </Select>
                <p className="text-sm text-tertiary">{t("agent.expiryHint")}</p>
                {expiry === NEVER && <Alert tone="warning">{t("agent.expiryNeverWarning")}</Alert>}
            </div>
            <Checkbox isSelected={limited} onChange={setLimited} isDisabled={create.isPending} label={t("agent.limitProjects")} hint={t("agent.limitProjectsHint")} />
            {limited && (
                <div className="flex flex-col gap-2 pl-6">
                    {projects?.length === 0 && <p className="text-[13px] text-tertiary">{t("agent.noProjectsToLimit")}</p>}
                    {projects?.map((project) => (
                        <Checkbox key={project.id} isSelected={projectIds.includes(project.id)} onChange={(selected) => toggleProject(project.id, selected)} isDisabled={create.isPending} label={`${project.name} (${project.issueKey})`} />
                    ))}
                    {projectIds.length === 0 && projects && projects.length > 0 && <p className="text-[13px] text-tertiary">{t("agent.limitProjectsRequired")}</p>}
                </div>
            )}
            {create.isError && <Alert tone="error">{create.error instanceof ApiError ? create.error.message : t("agent.couldNotCreateToken")}</Alert>}
        </form>
    );
}
