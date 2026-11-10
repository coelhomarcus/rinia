import { useState } from "react";
import { useBeforeUnload } from "react-router";

/**
 * What is being edited on the page: a title, a description or a comment that is not saved yet, and whether a save is
 * running. The editors report it as it changes, and the page uses it for its status line and to ask before closing the
 * tab. Each flag changes only when it flips, never per keystroke, so reporting costs the page one render.
 */
export function useEditActivity() {
    const [titleDirty, setTitleDirty] = useState(false);
    const [descriptionDirty, setDescriptionDirty] = useState(false);
    const [descriptionSaving, setDescriptionSaving] = useState(false);
    const [commentFilled, setCommentFilled] = useState(false);

    useBeforeUnload((event) => {
        if (!titleDirty && !descriptionDirty && !commentFilled) return;
        event.preventDefault();
        event.returnValue = "";
    });

    return { unsaved: titleDirty || descriptionDirty, descriptionSaving, setTitleDirty, setDescriptionDirty, setDescriptionSaving, setCommentFilled };
}
