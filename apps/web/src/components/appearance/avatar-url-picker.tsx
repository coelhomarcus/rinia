import { Popover } from "@base-ui/react/popover";
import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import { ImageCrop } from "@/components/appearance/image-crop";
import { overlayChrome } from "@/components/overlay/overlay-chrome";
import { deleteAvatar, uploadAvatar, type AuthUser } from "@/features/auth/api";
import { cx } from "@/utils/cx";
import { useTranslation } from "react-i18next";

/** The profile photo is a file on our volume. The cropper frames it; the URL field is gone. */
export function AvatarPhotoPicker({ hasPhoto, disabled, onUpdated, children }: { hasPhoto: boolean; disabled?: boolean; onUpdated: (user: AuthUser) => void; children: ReactNode }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [source, setSource] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const fileInput = useRef<HTMLInputElement>(null);

    const fail = (reason: unknown) => setError(reason instanceof Error ? reason.message : t("profile.couldNotUpdatePhoto"));

    const choose = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setError("");
        setSource(file);
    };

    const save = async (file: File) => {
        setBusy(true);
        setError("");
        try {
            onUpdated(await uploadAvatar(file));
            setSource(null);
            setOpen(false);
        } catch (reason) {
            fail(reason);
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        setBusy(true);
        setError("");
        try {
            onUpdated(await deleteAvatar());
            setSource(null);
            setOpen(false);
        } catch (reason) {
            fail(reason);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Popover.Root open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setSource(null); setError(""); } }}>
            <Popover.Trigger
                disabled={disabled}
                aria-label={hasPhoto ? t("profile.changePhoto") : t("profile.addPhoto")}
                className="group/avatar relative flex rounded-full outline-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {children}
                <span
                    aria-hidden="true"
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white can-hover:opacity-0 transition-opacity duration-150 can-hover:group-hover/avatar:opacity-100 group-focus-visible/avatar:opacity-100 group-data-[popup-open]/avatar:opacity-100 group-disabled/avatar:opacity-0"
                >
                    <Pencil className="size-3.5" fill="currentColor" strokeWidth={1.5} />
                </span>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Positioner side="bottom" align="start" sideOffset={8} collisionPadding={12} className="z-[60]">
                    <Popover.Popup className={cx("w-80 max-w-[calc(100vw-2rem)] rounded-lg", overlayChrome.popupPadded)}>
                        <Popover.Title className="mb-3 text-sm font-medium text-primary">{t("profile.profilePhoto")}</Popover.Title>
                        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={choose} />
                        {source ? (
                            <ImageCrop file={source} shape="circle" busy={busy} onCancel={() => setSource(null)} onConfirm={(file) => void save(file)} onError={setError} />
                        ) : (
                            <div className="flex justify-between gap-2">
                                <Button type="button" color="tertiary-destructive" size="sm" isDisabled={!hasPhoto || busy} onClick={() => void remove()}>{t("profile.removePhoto")}</Button>
                                <Button type="button" size="sm" isLoading={busy} onClick={() => fileInput.current?.click()}>{hasPhoto ? t("profile.changePhoto") : t("profile.addPhoto")}</Button>
                            </div>
                        )}
                        {error && <p role="alert" className="mt-3 text-xs text-danger-primary">{error}</p>}
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );
}
