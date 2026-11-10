import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/feedback/toaster";
import type { IssueDetail } from "../../api";
import { errorMessage } from "../../lib/error-message";
import type { IssueUpdater } from "./use-issue-mutations";

/**
 * The title while it is typed: it follows the issue's, until there is an edit not yet saved, and saves when the field
 * loses focus. An empty title is refused and the issue's own comes back.
 */
export function useIssueTitle({ issue, updater, onDirtyChange }: { issue: IssueDetail | undefined; updater: IssueUpdater; onDirtyChange: (dirty: boolean) => void }) {
    const { t } = useTranslation();
    const showToast = useToast();
    const [title, setTitle] = useState(issue?.title ?? "");
    const [error, setError] = useState<string | null>(null);
    const loadedIssueId = useRef<string | null>(null);
    const dirty = useRef(false);
    const version = useRef(0);

    useEffect(() => {
        if (!issue) return;
        if (loadedIssueId.current !== issue.id) {
            loadedIssueId.current = issue.id;
            dirty.current = false;
            setTitle(issue.title);
            setError(null);
            onDirtyChange(false);
            return;
        }
        if (!dirty.current) setTitle(issue.title);
    }, [issue, onDirtyChange]);

    const onChange = (value: string) => {
        dirty.current = true;
        version.current += 1;
        setError(null);
        setTitle(value);
        onDirtyChange(true);
    };

    const save = () => {
        if (!issue) return;
        const next = title.trim();
        if (!next) {
            setTitle(issue.title);
            dirty.current = false;
            onDirtyChange(false);
            showToast({ tone: "error", title: t("issue.titleRequired"), description: t("issue.titleReverted") });
            return;
        }
        if (next === issue.title) {
            dirty.current = false;
            onDirtyChange(false);
            return;
        }
        const saveVersion = version.current;
        updater.mutate(
            { identifier: issue.identifier, input: { title: next } },
            {
                onSuccess: () => {
                    if (loadedIssueId.current === issue.id && version.current === saveVersion) {
                        dirty.current = false;
                        onDirtyChange(false);
                    }
                },
                onError: (reason) => { if (loadedIssueId.current === issue.id) setError(errorMessage(reason, t("issue.couldNotSaveIssue"))); },
            },
        );
    };

    return { title, currentTitle: title.trim() || issue?.title || "", error, onChange, save };
}
