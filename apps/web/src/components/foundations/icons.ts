import type { ComponentType, SVGProps } from "react";
import { ArrowLeft, ChevronDown as ChevronDownIcon, ExternalLink as ExternalLinkIcon, FileText, FolderKanban, Inbox as InboxIcon, LayoutDashboard, List, LogOut, PanelLeft, Search as SearchIcon, Settings as SettingsIcon, Settings2, SquareKanban, User, X } from "lucide-react";

export type AppIcon = ComponentType<SVGProps<SVGSVGElement>>;
export const AppIcons = {
    ChevronDown: ChevronDownIcon, Close: X, Back: ArrowLeft,
    Board: SquareKanban, Documents: FileText, ExternalLink: ExternalLinkIcon,
    Issues: List, Menu: PanelLeft, Overview: LayoutDashboard,
    Projects: FolderKanban, Search: SearchIcon, Settings: SettingsIcon,
    SignOut: LogOut, General: Settings2, Inbox: InboxIcon, MyIssues: User,
} satisfies Record<string, AppIcon>;
