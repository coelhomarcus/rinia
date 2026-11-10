import type { Density } from "@rinia/shared";
import { RefreshCw, Rows3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { useDensity } from "@/providers/density";

export function DensitySelector() {
    const { t } = useTranslation();
    const { density, setDensity, syncFailed, retrySync } = useDensity();
    return (
        <div className="flex items-center gap-2">
            <Select
                size="sm"
                className="w-48"
                aria-label={t("profile.density")}
                selectedKey={density}
                onSelectionChange={(value) => setDensity((value ?? density) as Density)}
                icon={Rows3}
                items={[
                    { id: "comfortable", label: t("profile.densityComfortable") },
                    { id: "compact", label: t("profile.densityCompact") },
                ]}
            >
                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
            </Select>
            {syncFailed && (
                <Button color="tertiary" size="sm" iconLeading={RefreshCw} onClick={retrySync}>
                    {t("common.syncNow")}
                </Button>
            )}
        </div>
    );
}
