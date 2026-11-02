import type { Location } from "react-router";

/**
 * Where to go after signing in: the page that sent the person to sign in, such as an app's request to connect, or
 * home. Only a path inside Rinia is followed.
 */
export function returnPath(location: Location): string {
    const from = (location.state as { from?: Partial<Location> } | null)?.from;
    const path = `${from?.pathname ?? ""}${from?.search ?? ""}`;
    return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}
