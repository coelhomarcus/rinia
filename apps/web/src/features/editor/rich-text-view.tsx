import { type ReactNode, memo, useMemo } from "react";
import type { TiptapDocument } from "@rinia/shared";
import { type RichTextProfile, checkRichText, richTextExtensions } from "@rinia/shared/src/rich-text-schema";
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import { cx } from "@/utils/cx";
import { UnsupportedContent } from "./unsupported-content";

const extensions = new Map<RichTextProfile, ReturnType<typeof richTextExtensions>>();
const extensionsOf = (profile: RichTextProfile) => {
    let list = extensions.get(profile);
    if (!list) extensions.set(profile, (list = richTextExtensions(profile)));
    return list;
};

type Props = { node: { attrs: Record<string, unknown> }; children?: ReactNode };

/**
 * Blocks whose editor view is interactive, drawn here as plain markup: a checkbox that shows its state but cannot be
 * clicked, and an image at the width it was saved with.
 */
const nodeMapping = {
    taskItem: ({ node, children }: Props) => (
        <li data-type="taskItem" data-checked={node.attrs.checked ? "true" : "false"}>
            <label contentEditable={false}>
                <input type="checkbox" checked={!!node.attrs.checked} readOnly disabled tabIndex={-1} aria-hidden="true" />
            </label>
            <div>{children}</div>
        </li>
    ),
    image: ({ node }: Props) =>
        node.attrs.src ? (
            <figure className="document-image">
                <img src={String(node.attrs.src)} alt={String(node.attrs.alt ?? "")} loading="lazy" style={{ width: `${Math.max(10, Math.min(100, Number(node.attrs.widthPercent) || 100))}%` }} />
            </figure>
        ) : null,
};

/**
 * Rich text that is only read, such as a posted comment or an old version of a description. It renders the JSON
 * straight to React with the same extensions as the editors, so a long thread does not start one editor per comment.
 * Links open in a new tab, as they do in the editor.
 */
export const RichTextView = memo(function RichTextView({ content, profile, className }: { content: TiptapDocument; profile: RichTextProfile; className?: string }) {
    const check = useMemo(() => checkRichText(content, profile), [content, profile]);
    const rendered = useMemo(() => (check.ok ? renderToReactElement({ extensions: extensionsOf(profile), content, options: { nodeMapping } }) : null), [check, content, profile]);
    if (!check.ok) return <UnsupportedContent content={content} unsupported={check.unsupported} className={className} />;
    return (
        <div className={cx("rinia-prose", className)} data-profile={profile}>
            {rendered}
        </div>
    );
});
