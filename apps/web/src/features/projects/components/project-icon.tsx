import { readableBacking, type EntityIcon, type ProjectIconKey } from "@rinia/shared";
import { iconBackground } from "@/components/appearance/icon-color-picker";
import { cx } from "@/utils/cx";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import {
    Activity,
    AppWindow,
    Archive,
    Atom,
    Award,
    BookOpen,
    Box,
    Blocks,
    Bot,
    BriefcaseBusiness,
    Building2,
    CalendarDays,
    ChartNoAxesCombined,
    Code2,
    Compass,
    Cloud,
    Cpu,
    Database,
    Diamond,
    Fingerprint,
    Flag,
    FlaskConical,
    Folder,
    Gamepad2,
    Gauge,
    Gift,
    Globe2,
    Heart,
    Headphones,
    House,
    Layers3,
    Leaf,
    Lightbulb,
    LockKeyhole,
    Map,
    MessageCircle,
    Monitor,
    Music,
    Package,
    Palette,
    PenLine,
    Plane,
    Puzzle,
    Rocket,
    Server,
    Shield,
    ShoppingCart,
    Sparkles,
    Star,
    Store,
    Tag,
    Target,
    Telescope,
    Terminal,
    ThumbsUp,
    Ticket,
    Video,
    Wallet,
    Workflow,
    Users,
    Wrench,
    Zap,
    Smartphone,
} from "lucide-react";

/**
 * Maps shared keys (validated by the backend; see `projectIconKeys` in @rinia/shared) to the
 * library's concrete components. Importing each icon by name preserves tree-shaking — dynamic
 * access such as `icons[name]` would pull the complete library into the bundle.
 */
const PROJECT_ICONS: Record<ProjectIconKey, LucideIcon> = {
    cube: Box,
    rocket: Rocket,
    code: Code2,
    browser: AppWindow,
    briefcase: BriefcaseBusiness,
    book: BookOpen,
    chart: ChartNoAxesCombined,
    target: Target,
    lightbulb: Lightbulb,
    flag: Flag,
    star: Star,
    heart: Heart,
    globe: Globe2,
    server: Server,
    database: Database,
    mobile: Smartphone,
    desktop: Monitor,
    cart: ShoppingCart,
    zap: Zap,
    package: Package,
    palette: Palette,
    pen: PenLine,
    users: Users,
    tool: Wrench,
    activity: Activity,
    archive: Archive,
    atom: Atom,
    award: Award,
    blocks: Blocks,
    bot: Bot,
    building: Building2,
    calendar: CalendarDays,
    cloud: Cloud,
    compass: Compass,
    cpu: Cpu,
    diamond: Diamond,
    fingerprint: Fingerprint,
    flask: FlaskConical,
    folder: Folder,
    gamepad: Gamepad2,
    gauge: Gauge,
    gift: Gift,
    headphones: Headphones,
    house: House,
    layers: Layers3,
    leaf: Leaf,
    lock: LockKeyhole,
    map: Map,
    message: MessageCircle,
    music: Music,
    plane: Plane,
    puzzle: Puzzle,
    shield: Shield,
    sparkles: Sparkles,
    store: Store,
    tag: Tag,
    terminal: Terminal,
    telescope: Telescope,
    "thumbs-up": ThumbsUp,
    ticket: Ticket,
    video: Video,
    wallet: Wallet,
    workflow: Workflow,
};

export const DEFAULT_PROJECT_ICON: ProjectIconKey = "cube";

export function projectIconColor(icon: EntityIcon | string | null | undefined) {
    return icon && typeof icon === "object" && icon.type === "icon" ? icon.color ?? null : null;
}

/** Resolves the key saved in the database. Falls back when it is `null` (legacy project) or an unknown key (an icon later removed from the palette). */
export function resolveProjectIcon(key: string | null | undefined): LucideIcon {
    return PROJECT_ICONS[key as ProjectIconKey] ?? PROJECT_ICONS[DEFAULT_PROJECT_ICON];
}

interface ProjectIconProps {
    icon: EntityIcon | string | null | undefined;
    className?: string;
    /** Draws a colored icon on a tinted square of its own color instead of the bare glyph. */
    tile?: boolean;
    /**
     * `cover` sets every icon on an opaque square that keeps it readable on a project banner:
     * a coloured glyph on light or dark, whichever contrasts more, anything else on the theme surface.
     */
    backing?: "cover";
}

export const ProjectIcon = ({ icon, className, tile, backing }: ProjectIconProps) => {
    if (backing === "cover") return <CoverBackedIcon icon={icon} className={className} />;
    if (icon && typeof icon === "object") {
        if (icon.type === "emoji") {
            return (
                <span className={`inline-grid place-items-center overflow-hidden leading-none ${className ?? ""}`} style={{ containerType: "inline-size" }}>
                    <span style={{ fontSize: "82cqw", lineHeight: 1 }}>{icon.value}</span>
                </span>
            );
        }
        if (icon.type === "image") return <ProjectImageIcon url={icon.url} className={className} />;
        const Icon = resolveProjectIcon(icon.key);
        if (!icon.color) return <Icon className={className} />;
        if (!tile) return <Icon className={className} style={{ color: icon.color }} />;
        return (
            <span className={`inline-grid place-items-center rounded-md ${className ?? ""}`} style={{ color: icon.color, backgroundColor: iconBackground(icon.color) }}>
                <Icon className="size-[62%]" aria-hidden="true" />
            </span>
        );
    }
    const Icon = resolveProjectIcon(icon);
    return <Icon className={className} />;
};

function CoverBackedIcon({ icon, className }: { icon: EntityIcon | string | null | undefined; className?: string }) {
    const appearance = icon && typeof icon === "object" ? icon : null;
    const frame = "inline-grid shrink-0 place-items-center overflow-hidden rounded-md shadow-sm";
    if (appearance?.type === "icon" && appearance.color) {
        const Icon = resolveProjectIcon(appearance.key);
        return (
            <span className={cx(frame, "ring-1 ring-white/25", className)} style={{ color: appearance.color, backgroundColor: readableBacking(appearance.color) }}>
                <Icon className="size-[62%]" aria-hidden="true" />
            </span>
        );
    }
    const Icon = resolveProjectIcon(appearance?.type === "icon" ? appearance.key : typeof icon === "string" ? icon : null);
    return (
        <span className={cx(frame, "bg-surface-1 text-primary ring-1 ring-subtle", className)} style={{ containerType: "inline-size" }}>
            {appearance?.type === "emoji" ? (
                <span style={{ fontSize: "62cqw", lineHeight: 1 }}>{appearance.value}</span>
            ) : appearance?.type === "image" ? (
                <ProjectImageIcon url={appearance.url} className="size-full" fallbackClassName="size-[62%]" />
            ) : (
                <Icon className="size-[62%]" aria-hidden="true" />
            )}
        </span>
    );
}

function ProjectImageIcon({ url, className, fallbackClassName }: { url: string; className?: string; fallbackClassName?: string }) {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [url]);
    if (failed) {
        const Fallback = resolveProjectIcon(DEFAULT_PROJECT_ICON);
        return <Fallback className={fallbackClassName ?? className} />;
    }
    return (
        <span className={`inline-grid place-items-center overflow-hidden ${className ?? ""}`}>
            <img src={url} alt="" referrerPolicy="no-referrer" decoding="async" onError={() => setFailed(true)} className="size-full object-cover" />
        </span>
    );
}
