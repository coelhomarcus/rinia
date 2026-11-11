import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/base/buttons/button";
import { useTranslation } from "react-i18next";

export function NotFound() {
    const router = useNavigate();
    const { t } = useTranslation();

    return (
        <section className="flex min-h-dvh items-center justify-center bg-surface-1 pt-[max(2.5rem,env(safe-area-inset-top,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pb-[max(2.5rem,env(safe-area-inset-bottom,0px))] pl-[max(1rem,env(safe-area-inset-left,0px))] sm:pr-[max(1.5rem,env(safe-area-inset-right,0px))] sm:pl-[max(1.5rem,env(safe-area-inset-left,0px))]">
            <div className="w-full max-w-sm rounded-xl border border-subtle bg-layer-1 p-5 shadow-overlay-100">
                <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                        <span className="font-mono text-xs text-accent-primary">{t("errors.notFoundTitle")}</span>
                        <h1 className="text-lg font-semibold tracking-tight text-primary">{t("errors.pageMissing")}</h1>
                        <p className="text-sm leading-relaxed text-tertiary">{t("errors.pageMissingDescription")}</p>
                    </div>

                    <div className="flex flex-col-reverse gap-2 sm:flex-row">
                        <Button color="secondary" size="md" iconLeading={ArrowLeft} onClick={() => router(-1)}>
                            {t("common.back")}
                        </Button>
                        <Button size="md" onClick={() => router("/")}>
                            {t("errors.goHome")}
                        </Button>
                    </div>
                </div>
            </div>
        </section>
    );
}
