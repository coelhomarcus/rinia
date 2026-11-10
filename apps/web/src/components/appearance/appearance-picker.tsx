import type { EntityIcon } from "@rinia/shared";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, Smile, Sparkles, X } from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { ImageCrop } from "@/components/appearance/image-crop";
import { uploadProjectFile } from "@/features/editor/file-upload";
import { ProjectIconPicker } from "@/features/projects/components/project-icon-picker";
import { DEFAULT_PROJECT_ICON, ProjectIcon } from "@/features/projects/components/project-icon";
import { overlayChrome } from "@/components/overlay/overlay-chrome";
import { cx } from "@/utils/cx";
import { useTranslation } from "react-i18next";

export const appearancePopupClass = cx(
    "flex max-h-[min(32rem,calc(100dvh-2rem))] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden",
    overlayChrome.popup,
);

const EMOJIS = ["😀", "🚀", "✨", "🔥", "🎯", "📚", "🛠️", "💡", "✅", "🧠", "🎨", "🌱", "📌", "📈", "🧩", "🌍", "⚡", "🛰️", "📝", "💬", "🏗️", "🔒", "🧪", "🎉"];
type Tab = "icons" | "emoji" | "image";

interface AppearancePickerProps {
    value: EntityIcon | null | undefined;
    onChange: (appearance: EntityIcon | null) => void;
    onComplete?: () => void;
    /** Uploads the cropped square into this project. Absent while the project does not exist yet. */
    projectId?: string;
    /** Holds the cropped file until the caller can upload it. */
    onCroppedImage?: (file: File) => void;
}

export function AppearancePicker({ value, onChange, onComplete, projectId, onCroppedImage }: AppearancePickerProps) {
    const { t } = useTranslation();
    const [tab, setTab] = useState<Tab>(value?.type === "emoji" ? "emoji" : value?.type === "image" ? "image" : "icons");
    const [emoji, setEmoji] = useState(value?.type === "emoji" ? value.value : "");
    const [source, setSource] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [imageError, setImageError] = useState("");
    const fileInput = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (value?.type === "emoji") setEmoji(value.value);
    }, [value]);
    const select = (next: EntityIcon | null) => {
        onChange(next);
        onComplete?.();
    };
    const chooseImage = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setImageError("");
        setSource(file);
    };
    const confirmImage = async (file: File) => {
        setImageError("");
        if (!projectId) {
            onCroppedImage?.(file);
            onComplete?.();
            return;
        }
        setUploading(true);
        try {
            const stored = await uploadProjectFile(projectId, file);
            setSource(null);
            select({ type: "image", url: stored.url });
        } catch (reason) {
            setImageError(reason instanceof Error ? reason.message : t("appearance.imageUploadFailed"));
        } finally {
            setUploading(false);
        }
    };
    const fieldClass = "min-w-0 w-full !items-stretch [&>span]:max-w-full [&>span]:whitespace-normal";
    return (
        <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto p-3">
            <div className="flex shrink-0 items-center gap-1 border-b border-subtle pb-3" role="tablist" aria-label={t("appearance.appearanceType")}>
                {[
                    ["icons", Sparkles, t("appearance.icons")],
                    ["emoji", Smile, t("appearance.emoji")],
                    ["image", ImagePlus, t("appearance.image")],
                ].map(([id, Icon, label]) => (
                    <button key={id as string} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id as Tab)} className={`flex h-7 items-center gap-2 rounded-md px-2 text-xs font-medium ${tab === id ? "bg-layer-1 text-primary" : "text-tertiary hover:bg-layer-1-hover hover:text-secondary"}`}>
                        <Icon className="size-3.5" /> {label as string}
                    </button>
                ))}
                {value && <button type="button" className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-md text-tertiary hover:bg-layer-1-hover hover:text-danger-primary" onClick={() => select(null)} aria-label={t("appearance.removeIcon")}><X className="size-3.5" /></button>}
            </div>
            {tab === "icons" && (
                <ProjectIconPicker
                    value={value?.type === "icon" ? value.key : null}
                    color={value?.type === "icon" ? value.color : null}
                    onChange={(key) => {
                        const color = value?.type === "icon" ? value.color : undefined;
                        select({ type: "icon", key, ...(color ? { color } : {}) });
                    }}
                    onColorChange={(color) => onChange({ type: "icon", key: value?.type === "icon" ? value.key : DEFAULT_PROJECT_ICON, ...(color ? { color } : {}) })}
                />
            )}
            {tab === "emoji" && (
                <div className="flex min-w-0 flex-col gap-3">
                    <Input className={fieldClass} size="sm" label={t("appearance.emojiLabel")} value={emoji} onChange={setEmoji} placeholder={t("appearance.pasteEmoji")} />
                    <div className="grid grid-cols-8 gap-1" aria-label={t("appearance.emojiLabel")}>
                        {EMOJIS.map((item) => <button key={item} type="button" className="flex size-8 items-center justify-center rounded-md text-lg hover:bg-layer-1-hover focus-visible:outline-2 focus-visible:outline-accent-strong" onClick={() => { setEmoji(item); select({ type: "emoji", value: item }); }}>{item}</button>)}
                    </div>
                    <Button size="sm" className="self-start" isDisabled={!emoji.trim()} onClick={() => select({ type: "emoji", value: emoji.trim() })}>{t("appearance.useEmoji")}</Button>
                </div>
            )}
            {tab === "image" && (
                <div className="flex min-w-0 flex-col gap-3">
                    <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={chooseImage} />
                    {source ? (
                        <ImageCrop file={source} shape="square" busy={uploading} onCancel={() => setSource(null)} onConfirm={(file) => void confirmImage(file)} onError={setImageError} />
                    ) : (
                        <>
                            {value?.type === "image" && <div className="mx-auto size-16 overflow-hidden rounded-md border border-subtle bg-surface-2"><img src={value.url} alt="" className="size-full object-cover" /></div>}
                            <Button type="button" size="sm" className="self-start" iconLeading={ImagePlus} onClick={() => fileInput.current?.click()}>{t("appearance.chooseImage")}</Button>
                        </>
                    )}
                    {imageError && <p role="alert" className="text-xs text-danger-primary">{imageError}</p>}
                </div>
            )}
        </div>
    );
}

export function AppearancePreview({ value, className }: { value: EntityIcon | null | undefined; className?: string }) {
    return <ProjectIcon icon={value ?? null} className={className} />;
}
