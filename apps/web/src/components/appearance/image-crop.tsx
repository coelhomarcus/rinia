import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";
import { useTranslation } from "react-i18next";

const VIEW = 224;
const OUTPUT = 512;

/** The square the person framed, up to 512 px, as a JPEG. */
export async function cropToSquare(image: HTMLImageElement, view: number, offset: { x: number; y: number }, scale: number) {
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not crop the image");
    const ratio = OUTPUT / view;
    context.drawImage(image, offset.x * ratio, offset.y * ratio, image.naturalWidth * scale * ratio, image.naturalHeight * scale * ratio);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) throw new Error("Could not crop the image");
    return new File([blob], "image.jpg", { type: "image/jpeg" });
}

function clamp(value: number, shown: number) {
    return Math.min(0, Math.max(VIEW - shown, value));
}

/** Drag and zoom to frame a square. The circle is only how the profile preview is masked. */
export function ImageCrop({ file, shape, busy, onCancel, onConfirm, onError }: { file: File; shape: "circle" | "square"; busy?: boolean; onCancel: () => void; onConfirm: (file: File) => void; onError?: (message: string) => void }) {
    const { t } = useTranslation();
    const image = useRef<HTMLImageElement>(null);
    const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
    const [url, setUrl] = useState<string | null>(null);
    const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const next = URL.createObjectURL(file);
        setUrl(next);
        setNatural(null);
        setZoom(1);
        return () => URL.revokeObjectURL(next);
    }, [file]);

    const cover = natural ? Math.max(VIEW / natural.w, VIEW / natural.h) : 1;
    const scale = cover * zoom;
    const shown = natural ? { w: natural.w * scale, h: natural.h * scale } : { w: VIEW, h: VIEW };

    function place(x: number, y: number, size = shown) {
        return { x: clamp(x, size.w), y: clamp(y, size.h) };
    }

    function onLoad() {
        const element = image.current;
        if (!element) return;
        const size = { w: element.naturalWidth, h: element.naturalHeight };
        const fit = Math.max(VIEW / size.w, VIEW / size.h);
        setNatural(size);
        setOffset({ x: (VIEW - size.w * fit) / 2, y: (VIEW - size.h * fit) / 2 });
    }

    function changeZoom(next: number) {
        if (!natural) return;
        const previous = cover * zoom;
        const upcoming = cover * next;
        const centerX = (VIEW / 2 - offset.x) / previous;
        const centerY = (VIEW / 2 - offset.y) / previous;
        setZoom(next);
        setOffset(place(VIEW / 2 - centerX * upcoming, VIEW / 2 - centerY * upcoming, { w: natural.w * upcoming, h: natural.h * upcoming }));
    }

    return (
        <div className="flex flex-col items-center gap-3">
            <div
                className={cx("relative touch-none overflow-hidden bg-surface-2", shape === "circle" ? "rounded-full" : "rounded-md")}
                style={{ width: VIEW, height: VIEW }}
                onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
                }}
                onPointerMove={(event) => {
                    const start = drag.current;
                    if (!start) return;
                    setOffset(place(start.ox + event.clientX - start.x, start.oy + event.clientY - start.y));
                }}
                onPointerUp={() => {
                    drag.current = null;
                }}
            >
                {url && (
                    <img
                        ref={image}
                        src={url}
                        alt=""
                        draggable={false}
                        onLoad={onLoad}
                        className="absolute max-w-none select-none"
                        style={{ left: offset.x, top: offset.y, width: shown.w, height: shown.h }}
                    />
                )}
            </div>
            <label className="flex w-full items-center gap-3 text-xs text-secondary">
                <span>{t("appearance.zoom")}</span>
                <input className="min-w-0 flex-1" type="range" min={1} max={3} step={0.01} value={zoom} aria-label={t("appearance.zoom")} onChange={(event) => changeZoom(Number(event.target.value))} />
            </label>
            <div className="flex w-full justify-end gap-2">
                <Button type="button" color="secondary" size="sm" onClick={onCancel}>{t("common.cancel")}</Button>
                <Button
                    type="button"
                    size="sm"
                    isLoading={busy}
                    isDisabled={!natural}
                    onClick={() => {
                        const element = image.current;
                        if (!element || !natural) return;
                        void cropToSquare(element, VIEW, offset, scale).then(onConfirm, (reason: unknown) => onError?.(reason instanceof Error ? reason.message : "Could not crop the image"));
                    }}
                >
                    {t("appearance.cropImage")}
                </Button>
            </div>
        </div>
    );
}
