import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { Download, FileArchive, Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/base/buttons/button";
import { useToast } from "@/components/feedback/toaster";
import { overlayChrome } from "@/components/overlay/overlay-chrome";
import { downloadDocumentMarkdown, downloadProjectDocuments } from "@/features/documents/api";
import { ApiError } from "@/lib/api-client";

const item = "flex min-h-7 w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-left text-[13px] text-secondary outline-none data-disabled:cursor-default data-disabled:opacity-50 data-highlighted:bg-menu-hover";

function useDownload() {
    const { t } = useTranslation();
    const toast = useToast();
    const [busy, setBusy] = useState(false);
    async function run(download: () => Promise<void>) {
        setBusy(true);
        try {
            await download();
        } catch (error) {
            toast({ tone: "error", title: error instanceof ApiError ? error.message : t("documents.couldNotExport") });
        } finally {
            setBusy(false);
        }
    }
    return { busy, run };
}

export function ExportAllPagesButton({ projectId, disabled }: { projectId: string; disabled?: boolean }) {
    const { t } = useTranslation();
    const { busy, run } = useDownload();
    return (
        <Button color="secondary" size="sm" iconLeading={FileArchive} isDisabled={disabled || busy} isLoading={busy} onClick={() => void run(() => downloadProjectDocuments(projectId))}>
            {t("documents.downloadAllPages")}
        </Button>
    );
}

export function DocumentExportMenu({ projectId, documentId }: { projectId: string; documentId: string }) {
    const { t } = useTranslation();
    const { busy, run } = useDownload();
    return (
        <Menu.Root>
            <Menu.Trigger
                aria-label={t("documents.pageMenu")}
                className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-placeholder outline-none hover:bg-layer-1-hover hover:text-secondary focus-visible:ring-2 focus-visible:ring-accent-strong"
            >
                <Download className="size-4" aria-hidden="true" />
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Positioner align="end" side="bottom" sideOffset={6} className="z-50">
                    <Menu.Popup className={`${overlayChrome.menu} w-60`}>
                        <Menu.Item className={item} disabled={busy} onClick={() => void run(() => downloadDocumentMarkdown(projectId, documentId))}>
                            <Download className="size-4" aria-hidden="true" />
                            {t("documents.downloadMarkdown")}
                        </Menu.Item>
                        <Menu.Item className={item} disabled={busy} onClick={() => void run(() => downloadProjectDocuments(projectId))}>
                            <FileArchive className="size-4" aria-hidden="true" />
                            {t("documents.downloadAllPages")}
                        </Menu.Item>
                        <Menu.Separator className="my-1 border-t border-subtle" />
                        <Menu.Item className={item} onClick={() => window.print()}>
                            <Printer className="size-4" aria-hidden="true" />
                            {t("documents.printPdf")}
                        </Menu.Item>
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}
