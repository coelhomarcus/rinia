import { Popover } from "@base-ui/react/popover";
import { useEffect, useState, type ReactNode } from "react";
import { Camera } from "lucide-react";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { overlayChrome } from "@/components/overlay/overlay-chrome";
import { cx } from "@/utils/cx";
import { Input } from "@/components/base/input/input";
import { useTranslation } from "react-i18next";

interface AvatarUrlPickerProps {
    value: string | null | undefined;
    initials: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    /** The current photo. It is the button: hovering it shows the edit icon over it. */
    children: ReactNode;
}

/** A profile-photo control: stage an URL, then apply it to the form. */
export function AvatarUrlPicker({ value, initials, onChange, disabled, children }: AvatarUrlPickerProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [url, setUrl] = useState(value ?? "");
    const [error, setError] = useState("");

    useEffect(() => {
        if (open) {
            setUrl(value ?? "");
            setError("");
        }
    }, [open, value]);

    const apply = () => {
        try {
            const parsed = new URL(url.trim());
            if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) throw new Error();
            onChange(parsed.toString());
            setOpen(false);
        } catch {
            setError(t("appearance.httpImageUrl"));
        }
    };

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger
                disabled={disabled}
                aria-label={value ? t("profile.changePhoto") : t("profile.addPhoto")}
                className="group/avatar relative flex rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {children}
                <span
                    aria-hidden="true"
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity duration-150 group-hover/avatar:opacity-100 group-focus-visible/avatar:opacity-100 group-data-[popup-open]/avatar:opacity-100 group-disabled/avatar:opacity-0"
                >
                    <Camera className="size-4" />
                </span>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Positioner side="bottom" align="start" sideOffset={8} collisionPadding={12} className="z-[60]">
                    <Popover.Popup className={cx("w-80 max-w-[calc(100vw-2rem)] rounded-lg", overlayChrome.popupPadded)}>
                        <Popover.Title className="mb-3 text-sm font-medium text-primary">{t("profile.profilePhoto")}</Popover.Title>
                        <div className="space-y-3">
                            <Input
                                label={t("profile.profilePhotoUrl")}
                                value={url}
                                onChange={(next) => {
                                    setUrl(next);
                                    setError("");
                                }}
                                placeholder="https://..."
                                isInvalid={!!error}
                                hint={error || t("appearance.directImage")}
                            />
                            <div className="flex h-20 items-center justify-center rounded-md border border-subtle bg-surface-2">
                                <Avatar key={url} src={url || undefined} initials={initials} size="xl" rounded={false} className="rounded-md" />
                            </div>
                            <div className="flex justify-between gap-2">
                                <Button color="tertiary-destructive" size="sm" isDisabled={!value} onClick={() => { onChange(""); setOpen(false); }}>
                                    {t("profile.removePhoto")}
                                </Button>
                                <Button size="sm" onClick={apply}>{t("appearance.apply")}</Button>
                            </div>
                        </div>
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );
}
