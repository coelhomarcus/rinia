import type { Request } from "express";
import { env } from "../config/env";

/** Where Rinia is opened. Production always has APP_URL. Development and test use it when set, otherwise the address the request came in on. */
export function appBaseUrl(req: Request) {
    return env.APP_URL ?? `${req.protocol}://${req.get("host")}`;
}
