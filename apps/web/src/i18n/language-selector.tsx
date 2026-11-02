import type { Locale } from "@rinia/shared";
import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "./language-provider";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
    const { t } = useTranslation();
    const { locale, setLocale, syncFailed, retrySync } = useLanguage();
    return (
        <div className="flex items-center gap-2">
            <Select
                size="sm"
                className={compact ? "w-40" : "w-48"}
                aria-label={t("common.language")}
                selectedKey={locale}
                onSelectionChange={(value) => setLocale((value ?? locale) as Locale)}
                icon={Languages}
                items={[
                    { id: "pt-BR", label: t("common.portugueseBrazil"), icon: <span className="text-[13px] leading-none">🇧🇷</span> },
                    { id: "en", label: t("common.english"), icon: <span className="text-[13px] leading-none">🇺🇸</span> },
                ]}
            >
                {(item) => <Select.Item id={item.id} icon={item.icon}>{item.label}</Select.Item>}
            </Select>
            {syncFailed && <Button color="tertiary" size="sm" onClick={retrySync}>{t("common.syncNow")}</Button>}
        </div>
    );
}
