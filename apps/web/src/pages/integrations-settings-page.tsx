import { useState } from "react";
import { Search } from "lucide-react";
import { Link } from "react-router";
import { SettingsPage } from "@/components/settings/settings-layout";
import { integrationCategories, integrations, type Integration } from "@/features/integrations/catalog";
import { IntegrationTile } from "@/features/integrations/components/integration-icon";
import { urls } from "@/lib/urls";
import { useTranslation } from "react-i18next";

/** Compact cards of one height once they sit side by side, as in Linear's catalog; hovering lightens the card and nothing else moves. */
const cardClass = "flex flex-col gap-3 overflow-hidden @sm:h-39 rounded-lg border border-subtle bg-layer-1 p-4";

/** Every integration, by category, as cards. The ones not built yet are listed too, marked as coming soon. */
export function IntegrationsSettingsPage() {
    const { t } = useTranslation();
    const [query, setQuery] = useState("");
    const wanted = query.trim().toLowerCase();
    const matches = (integration: Integration) => !wanted || `${integration.name} ${t(integration.tagline as "integrations.mcpTagline")}`.toLowerCase().includes(wanted);
    const sections = integrationCategories
        .map((category) => ({ ...category, items: integrations.filter((integration) => integration.category === category.id && matches(integration)) }))
        .filter((section) => section.items.length > 0);

    return (
        <SettingsPage title={t("integrations.title")} description={t("integrations.description")}>
            <label className="flex h-8 w-full items-center gap-2 rounded-md border border-subtle bg-layer-1 px-3 focus-within:border-accent-strong">
                <Search className="size-4 shrink-0 text-placeholder" aria-hidden="true" />
                <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t("integrations.search")}
                    aria-label={t("integrations.search")}
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-primary outline-none placeholder:text-placeholder"
                />
            </label>
            {sections.length === 0 && <p className="mt-10 text-center text-[13px] text-tertiary">{t("integrations.noResults", { query: query.trim() })}</p>}
            {sections.map((section) => (
                <section key={section.id} className="@container mt-12">
                    <h2 className="mb-3 px-4 text-xs font-medium tracking-wide text-tertiary uppercase select-none">{t(section.label as "integrations.categoryAi")}</h2>
                    <div className="grid grid-cols-1 gap-4 @sm:grid-cols-2 @xl:grid-cols-3">
                        {section.items.map((integration) => (
                            <IntegrationCard key={integration.slug} integration={integration} />
                        ))}
                    </div>
                </section>
            ))}
        </SettingsPage>
    );
}

function IntegrationCard({ integration }: { integration: Integration }) {
    const { t } = useTranslation();
    const body = (
        <>
            <div className="flex items-center gap-3">
                <IntegrationTile logo={integration.logo} />
                <span className="min-w-0 flex-1 truncate text-md font-medium text-primary">{integration.name}</span>
            </div>
            <p className="line-clamp-4 text-[13px] leading-tight text-tertiary">{t(integration.tagline as "integrations.mcpTagline")}</p>
            {/* At the foot of the card, where it never crowds the name. */}
            {!integration.available && <span className="mt-auto self-start rounded-full border border-subtle px-2 py-0.5 text-[11px] text-tertiary">{t("integrations.comingSoon")}</span>}
        </>
    );
    if (!integration.available)
        return (
            <div className={`${cardClass} select-none`} aria-disabled="true">
                {body}
            </div>
        );
    return (
        <Link
            to={urls.integration(integration.slug)}
            className={`${cardClass} transition-colors duration-150 hover:bg-layer-1-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong`}
        >
            {body}
        </Link>
    );
}
