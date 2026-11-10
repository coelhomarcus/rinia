import { Suspense, lazy, type ComponentProps } from "react";
import type { IssueQuickCreateModal as QuickCreateModal } from "./issue-quick-create-modal";

const Modal = lazy(() => import("./issue-quick-create-modal").then((module) => ({ default: module.IssueQuickCreateModal })));

/**
 * The quick-create dialog, loaded the first time it opens. It carries the rich-text editor, which every page would
 * otherwise download for the sake of a dialog most visits never open.
 */
export function IssueQuickCreateModal(props: ComponentProps<typeof QuickCreateModal>) {
    return (
        <Suspense fallback={null}>
            <Modal {...props} />
        </Suspense>
    );
}
