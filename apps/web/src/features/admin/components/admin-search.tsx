import type { ReactNode } from "react";
import { Search } from "lucide-react";

/** The filter above an admin list, with how many items the list holds in all when no other control says so. */
export function AdminSearch({ value, onChange, placeholder, total, children }: { value: string; onChange: (value: string) => void; placeholder: string; total?: string; children?: ReactNode }) {
    return (
        <div className="mb-3 flex flex-wrap items-center gap-2 px-4">
            <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-subtle bg-layer-1 px-2.5 text-[13px] focus-within:border-accent-strong sm:max-w-72">
                <Search className="size-4 shrink-0 text-placeholder" aria-hidden="true" />
                <input
                    type="search"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={placeholder}
                    aria-label={placeholder}
                    className="min-w-0 flex-1 select-text bg-transparent text-primary outline-none placeholder:text-placeholder"
                />
            </label>
            {children}
            {total && <span className="ml-auto text-[13px] text-tertiary select-none">{total}</span>}
        </div>
    );
}
