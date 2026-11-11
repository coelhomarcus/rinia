import { Navigate } from "react-router";
import { Sidebar } from "@/components/layout/sidebar";
import { useBreakpoint } from "@/hooks/use-breakpoint";

/**
 * On a phone the sidebar is a page of its own: Home (`/home`) shows projects, favorites and the account, and
 * `/settings` shows the settings sections. From `md` up the sidebar is always on screen, so these pages hand over to
 * a real destination instead.
 */
export function MobileNavPage({ desktopTo }: { desktopTo: string }) {
    const wide = useBreakpoint("md");
    if (wide) return <Navigate to={desktopTo} replace />;
    return (
        <div className="flex min-h-0 flex-1 flex-col pt-1">
            <Sidebar />
        </div>
    );
}
