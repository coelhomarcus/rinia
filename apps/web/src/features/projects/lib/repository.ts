import type { FC } from "react";
import { Github, Gitlab } from "@makeplane/propel/icons";
import { AppIcons } from "@/components/foundations/icons";

export interface RepositoryHost {
    /** The service's name, such as GitHub, or null for a host we do not recognise. */
    name: string | null;
    /** The service's mark, or the generic external-link arrow when we have no icon for it. */
    icon: FC<{ className?: string }>;
}

const GENERIC: RepositoryHost = { name: null, icon: AppIcons.ExternalLink };

/** Hosts we can name, by their domain; self-hosted GitLab usually lives on a `gitlab.` subdomain. */
const HOSTS: Array<{ test: (host: string) => boolean; name: string; icon?: FC<{ className?: string }> }> = [
    { test: (host) => host === "github.com" || host.endsWith(".github.com"), name: "GitHub", icon: Github },
    { test: (host) => host === "gitlab.com" || host.startsWith("gitlab."), name: "GitLab", icon: Gitlab },
    { test: (host) => host === "bitbucket.org" || host.startsWith("bitbucket."), name: "Bitbucket" },
    { test: (host) => host === "codeberg.org", name: "Codeberg" },
    { test: (host) => host === "dev.azure.com" || host.endsWith(".visualstudio.com"), name: "Azure DevOps" },
];

/** Which service a repository link points at, from its domain. Anything unknown, or not a link, is generic. */
export function repositoryHost(url: string | null | undefined): RepositoryHost {
    if (!url) return GENERIC;
    let host: string;
    try {
        host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
        return GENERIC;
    }
    const match = HOSTS.find((candidate) => candidate.test(host));
    return match ? { name: match.name, icon: match.icon ?? AppIcons.ExternalLink } : GENERIC;
}
