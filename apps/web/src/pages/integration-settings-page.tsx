import { useState, type ReactNode } from "react";
import { Globe, X } from "lucide-react";
import { Link, Navigate, useParams } from "react-router";
import { RiniaIcon } from "@/components/foundations/logo/rinia-icon";
import { Tabs } from "@/components/application/tabs/tabs";
import { SettingsPage } from "@/components/settings/settings-layout";
import { CreateTokenForm } from "@/features/agent/components/create-token-form";
import { findIntegration, mcpServerUrl, TOKEN_PLACEHOLDER, type McpIntegration, type SetupStep } from "@/features/integrations/catalog";
import { CopyField } from "@/features/integrations/components/copy-field";
import { IntegrationTile } from "@/features/integrations/components/integration-icon";
import { McpToolList } from "@/features/integrations/components/mcp-tool-list";
import { urls } from "@/lib/urls";
import { useTranslation } from "react-i18next";

/** One integration: what it is, what it can do, and how to connect it, step by step. */
export function IntegrationSettingsPage() {
    const { slug } = useParams();
    const integration = findIntegration(slug);
    if (!integration) return <Navigate to={urls.integrations()} replace />;
    return <IntegrationDetail key={integration.slug} integration={integration} />;
}

function IntegrationDetail({ integration }: { integration: McpIntegration }) {
    const { t } = useTranslation();
    const website = new URL(integration.website).hostname.replace(/^www\./, "");
    const { signInSteps, tokenSteps } = integration;

    return (
        <SettingsPage back={{ to: urls.integrations(), label: t("integrations.back") }}>
            <header className="mb-8 flex items-center gap-4 px-4">
                <IntegrationTile logo={integration.logo} size="lg" />
                <div className="min-w-0">
                    <h1 className="truncate text-display-sm font-semibold tracking-tight text-primary">{integration.name}</h1>
                    <p className="text-[13px] text-tertiary">{t(integration.tagline as "integrations.mcpTagline")}</p>
                </div>
            </header>

            <div className="rounded-lg border border-subtle bg-layer-1 p-4">
                <div className="flex h-40 flex-col items-center justify-center gap-5 rounded-md border border-subtle bg-surface-1 select-none" aria-hidden="true">
                    <div className="flex items-center gap-6">
                        <span className="grid size-12 place-items-center rounded-xl border border-subtle bg-layer-2 text-primary">
                            <RiniaIcon className="size-7" />
                        </span>
                        <X className="size-4 text-quaternary" strokeWidth={1.5} />
                        <IntegrationTile logo={integration.logo} size="lg" />
                    </div>
                    <p className="font-mono text-[11px] tracking-[0.2em] text-tertiary uppercase">{t("integrations.banner")}</p>
                </div>
                <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3 select-none">
                    <Meta label={t("integrations.kind")}>{t("integrations.kindMcp")}</Meta>
                    <Meta label={t("integrations.website")}>
                        <a href={integration.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                            <Globe className="size-3.5 text-tertiary" aria-hidden="true" />
                            {website}
                        </a>
                    </Meta>
                </dl>
            </div>

            <Section title={t("integrations.overview")}>
                <p className="text-[13px] leading-5 text-secondary">{t("integrations.mcpOverview")}</p>
            </Section>

            <Section title={t("integrations.tools")} description={t("integrations.toolsDescription")}>
                <McpToolList />
            </Section>

            <Section title={t("integrations.setup")}>
                {signInSteps && tokenSteps ? (
                    // Signing in comes first: nothing to copy, and the person chooses what the tool may do.
                    <Tabs defaultSelectedKey="sign-in">
                        <Tabs.List type="button-border" fullWidth aria-label={t("integrations.setupMethod")} className="mb-4">
                            <Tabs.Item id="sign-in">{t("integrations.setupSignIn")}</Tabs.Item>
                            <Tabs.Item id="token">{t("integrations.setupToken")}</Tabs.Item>
                        </Tabs.List>
                        <Tabs.Panel id="sign-in">
                            <SignInSetup steps={signInSteps} />
                        </Tabs.Panel>
                        {/* Kept mounted, so a token created here survives a look at the other tab. */}
                        <Tabs.Panel id="token" keepMounted>
                            <TokenSetup integration={integration} steps={tokenSteps} />
                        </Tabs.Panel>
                    </Tabs>
                ) : signInSteps ? (
                    <SignInSetup steps={signInSteps} />
                ) : (
                    tokenSteps && <TokenSetup integration={integration} steps={tokenSteps} />
                )}
                {integration.note && <p className="mt-5 rounded-md border border-subtle bg-layer-2 px-3 py-2 text-[13px] text-secondary">{t(integration.note as "integrations.claudeNote")}</p>}
            </Section>
        </SettingsPage>
    );
}

/** Setup by signing in with Rinia: the steps, and when to pick a token instead. */
function SignInSetup({ steps }: { steps: SetupStep[] }) {
    const { t } = useTranslation();
    return (
        <>
            <p className="mb-4 text-[13px] text-tertiary">{t("integrations.setupSignInHint")}</p>
            <SetupSteps steps={steps} setup={{ url: mcpServerUrl(), token: TOKEN_PLACEHOLDER }} />
        </>
    );
}

/** Setup with an API token: create one here, and it is filled into the steps that need it. */
function TokenSetup({ integration, steps }: { integration: McpIntegration; steps: SetupStep[] }) {
    const { t } = useTranslation();
    // A token created on this page is filled into the steps; until then they show a placeholder.
    const [token, setToken] = useState<string | null>(null);
    // Some tools ask for the token themselves (VS Code), so it is not written into any step.
    const fillsToken = steps.some((step) => step.snippet?.code({ url: "", token: "\u0000" }).includes("\u0000"));
    return (
        <>
            {integration.signInSteps && <p className="mb-4 text-[13px] text-tertiary">{t("integrations.setupTokenHint")}</p>}
            <SetupSteps steps={steps} setup={{ url: mcpServerUrl(), token: token ?? TOKEN_PLACEHOLDER }} first={2}>
                <Step number={1} text={t("integrations.tokenStep")}>
                    <p className="text-[13px] text-tertiary">{token ? `${t("integrations.tokenCreated")}${fillsToken ? ` ${t("integrations.tokenFilledIn")}` : ""}` : fillsToken ? t("integrations.tokenStepHint") : t("integrations.tokenStepHintPaste")}</p>
                    {token ? (
                        <CopyField value={token} label={t("agent.newToken")} />
                    ) : (
                        <CreateTokenForm placeholder={t("agent.tokenNamePlaceholderFor", { name: integration.name })} onCreated={(created) => setToken(created.secret)} />
                    )}
                    <Link to={urls.apiTokens()} className="self-start text-[13px] text-tertiary underline decoration-subtle underline-offset-2 hover:text-primary">
                        {t("integrations.manageTokens")}
                    </Link>
                </Step>
            </SetupSteps>
        </>
    );
}

/** Numbered steps, each with what to paste when it has something. `children` come first, as step 1. */
function SetupSteps({ steps, setup, first = 1, children }: { steps: SetupStep[]; setup: { url: string; token: string }; first?: number; children?: ReactNode }) {
    const { t } = useTranslation();
    return (
        <ol className="space-y-5">
            {children}
            {steps.map((step, index) => (
                <Step key={step.text} number={index + first} text={t(step.text as "integrations.mcpStep1")}>
                    {step.snippet && <CopyField value={step.snippet.code(setup)} label={t(step.text as "integrations.mcpStep1")} language={step.snippet.language} />}
                </Step>
            ))}
        </ol>
    );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div>
            <dt className="text-[11px] font-medium tracking-wide text-tertiary uppercase">{label}</dt>
            <dd className="mt-0.5 text-[13px] text-primary">{children}</dd>
        </div>
    );
}

/** A titled card, laid out like a settings group but holding free-form content. */
function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
    return (
        <section className="mt-12">
            <div className="mb-3 px-4 select-none">
                <h2 className="text-lg font-medium text-primary">{title}</h2>
                {description && <p className="mt-0.5 text-[13px] text-tertiary">{description}</p>}
            </div>
            <div className="rounded-lg border border-subtle bg-layer-1 p-4">{children}</div>
        </section>
    );
}

function Step({ number, text, children }: { number: number; text: string; children?: ReactNode }) {
    return (
        <li className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full border border-subtle bg-layer-2 text-[12px] font-medium text-secondary">{number}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
                <p className="text-[13px] leading-5 text-primary">{text}</p>
                {children}
            </div>
        </li>
    );
}
