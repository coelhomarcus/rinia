import type { ComponentProps } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { dragSurfaceClass } from "@/features/issues/lib/drag-sensors";
import { cx } from "@/utils/cx";
import { dragSlotClass, sortableTransition } from "./drag-feedback";
import { IssueListRow } from "./issue-list-row";
import { propertyIcon } from "./issue-property-menus";

/**
 * An issue row that can be dragged to a new place in the list. It is the only row that needs the drag-and-drop
 * library, so lists that cannot be rearranged use `IssueListRow` and never load it.
 */
export function SortableIssueListRow({ sortable, ...props }: Omit<ComponentProps<typeof IssueListRow>, "drag"> & { sortable: boolean }) {
    const { t } = useTranslation();
    const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.issue.id, disabled: !sortable, transition: sortableTransition });
    const handle = sortable ? (
        <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            aria-label={t("issue.dragToReorder")}
            className={cx(
                "flex size-5 shrink-0 cursor-grab items-center justify-center rounded text-placeholder can-hover:opacity-0 can-hover:group-hover/issue:opacity-100 can-hover:group-focus-within/issue:opacity-100 hover:bg-layer-1-hover focus-visible:opacity-100 active:cursor-grabbing",
                dragSurfaceClass,
            )}
        >
            <GripVertical className={propertyIcon} />
        </button>
    ) : null;
    return (
        <IssueListRow
            {...props}
            drag={{
                setNodeRef,
                style: { transform: CSS.Translate.toString(transform), transition },
                className: isDragging ? cx("z-10 border opacity-50", dragSlotClass) : undefined,
                handle,
            }}
        />
    );
}
