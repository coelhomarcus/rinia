import pino, { type DestinationStream, type LevelWithSilent, type Logger } from "pino";
import { isColorSupported, prettyFactory } from "pino-pretty";

export type { Logger };
export type LogFormat = "json" | "pretty";

export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal", "silent"] as const satisfies readonly LevelWithSilent[];
export const LOG_FORMATS = ["json", "pretty"] as const satisfies readonly LogFormat[];

const REDACTED = "[Redacted]";
const MAX_DEPTH = 8;

/** Keys whose values never reach a log, compared lowercase with `-` and `_` removed: secrets, and what people write. */
const SECRET_KEYS = new Set([
    "authorization",
    "cookie",
    "cookies",
    "setcookie",
    "password",
    "passwordhash",
    "currentpassword",
    "newpassword",
    "token",
    "tokenhash",
    "apitoken",
    "accesstoken",
    "secret",
    "jwt",
    "specialcode",
    "description",
    "descriptionjson",
    "content",
    "contentjson",
    "markdown",
    "body",
    "yjsstate",
]);

/** `rinia_` API tokens, JWTs (sessions), and whatever follows "Bearer". */
const SECRET_PATTERNS = [/rinia_[A-Za-z0-9_-]+/g, /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, /(Bearer\s+)\S+/gi];
/** Drizzle puts a failed query's values at the end of its error message; in a stack, the frames follow them. */
const QUERY_PARAMS = /(\nparams: )[\s\S]*?(?=\n\s+at |$)/;

export interface LoggerSettings {
    level: LevelWithSilent;
    format: LogFormat;
}

/** NODE_ENV as the process was started with. Read through a parameter: `Bun.build` replaces a literal `process.env.NODE_ENV` with its own value. */
const runtimeNodeEnv = (source: Record<string, string | undefined> = process.env) => source.NODE_ENV ?? "development";

/** `LOG_LEVEL` and `LOG_FORMAT`, defaulting by `NODE_ENV`: quiet tests, chatty and coloured development, JSON in production. */
export function logSettings(source: Record<string, string | undefined> = process.env): LoggerSettings {
    const nodeEnv = runtimeNodeEnv(source);
    const level = LOG_LEVELS.find((value) => value === source.LOG_LEVEL?.trim().toLowerCase());
    const format = LOG_FORMATS.find((value) => value === source.LOG_FORMAT?.trim().toLowerCase());
    return {
        level: level ?? (nodeEnv === "production" ? "info" : nodeEnv === "test" ? "silent" : "debug"),
        format: format ?? (nodeEnv === "development" ? "pretty" : "json"),
    };
}

/** Removes tokens, JWTs, the registration code and query values from text such as an error message. */
export function scrubText(text: string, registrationCode = process.env.SPECIAL_REGISTRATION_CODE): string {
    let scrubbed = text.replace(QUERY_PARAMS, `$1${REDACTED}`);
    for (const pattern of SECRET_PATTERNS) scrubbed = scrubbed.replace(pattern, (match, bearer?: string) => (typeof bearer === "string" ? bearer : "") + REDACTED);
    // A short code would match ordinary words, so only a real one is looked for.
    if (registrationCode && registrationCode.length >= 6) scrubbed = scrubbed.split(registrationCode).join(REDACTED);
    return scrubbed;
}

const isSecretKey = (key: string) => SECRET_KEYS.has(key.toLowerCase().replace(/[-_]/g, ""));

/**
 * An error as plain fields: its name, message, stack and cause, and for Postgres errors the code, constraint and table
 * (Drizzle wraps them, so they are often on the cause). `detail` is left out: Postgres puts the clashing values there.
 */
export function serializeError(error: unknown, depth = 0): Record<string, unknown> {
    if (!(error instanceof Error)) return { message: scrubText(String(error)) };
    const fields = error as Error & { code?: unknown; constraint?: unknown; table?: unknown; column?: unknown; statusCode?: unknown; cause?: unknown };
    const serialized: Record<string, unknown> = { name: error.name, message: scrubText(error.message) };
    // Strings only: Bun gives every error a numeric `line` and `column` of its own.
    for (const key of ["code", "constraint", "table", "column"] as const) {
        if (typeof fields[key] === "string") serialized[key] = fields[key];
    }
    if (typeof fields.statusCode === "number") serialized.statusCode = fields.statusCode;
    if (error.stack) serialized.stack = scrubText(error.stack);
    if (fields.cause !== undefined && depth < MAX_DEPTH) serialized.cause = serializeError(fields.cause, depth + 1);
    return serialized;
}

/** A copy of what is being logged with secrets and content replaced, errors serialized, and cycles cut. */
export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
    if (typeof value === "string") return scrubText(value);
    if (typeof value === "bigint") return value.toString();
    if (value === null || typeof value !== "object") return value;
    if (value instanceof Error) return serializeError(value);
    if (value instanceof Date) return value.toISOString();
    if (ArrayBuffer.isView(value)) return `[${value.byteLength} bytes]`;
    if (seen.has(value) || depth >= MAX_DEPTH) return "[Truncated]";
    seen.add(value);
    if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1, seen));
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) copy[key] = isSecretKey(key) ? REDACTED : redact(item, depth + 1, seen);
    return copy;
}

export interface CreateLoggerOptions extends Partial<LoggerSettings> {
    /** Where lines go; defaults to stdout. */
    destination?: DestinationStream;
    /** Colours in pretty output; by default when the terminal supports them. */
    colorize?: boolean;
    nodeEnv?: string;
}

const stdout = (): DestinationStream => pino.destination({ dest: 1, sync: true });

/**
 * One JSON line per event, or coloured lines for a person reading a terminal. pino runs without transports: their
 * worker threads do not survive `Bun.build`. pino-pretty formats each line in this thread instead, synchronously, so
 * a fatal error is written before the process exits.
 */
export function createLogger(options: CreateLoggerOptions = {}): Logger {
    const defaults = logSettings();
    const level = options.level ?? defaults.level;
    const json = (options.format ?? defaults.format) === "json";
    const target = options.destination ?? stdout();
    const prettify = json ? undefined : prettyFactory({ colorize: options.colorize ?? isColorSupported, translateTime: "SYS:HH:MM:ss.l", ignore: "service,env" });
    const destination = prettify ? { write: (line: string) => target.write(prettify(line)) } : target;

    return pino(
        {
            level,
            base: { service: "rinia-api", env: options.nodeEnv ?? runtimeNodeEnv() },
            timestamp: json ? pino.stdTimeFunctions.isoTime : pino.stdTimeFunctions.epochTime,
            // pino-pretty reads numeric levels; JSON readers want the name.
            formatters: {
                ...(json ? { level: (label: string) => ({ level: label }) } : {}),
                log: (object) => redact(object) as Record<string, unknown>,
            },
            // Errors are serialized by `redact` above, which pino's own `err` serializer would undo.
            serializers: { err: (value: unknown) => value },
            hooks: {
                logMethod(args, method) {
                    const [first, ...rest] = args as unknown[];
                    // logger.error(error, "message") keeps the error under `err`, like pino does, and its message scrubbed.
                    if (first instanceof Error) {
                        const message = typeof rest[0] === "string" ? rest.shift() : first.message;
                        return method.apply(this, [{ err: first }, scrubText(String(message)), ...rest] as never);
                    }
                    return method.apply(this, args.map((arg) => (typeof arg === "string" ? scrubText(arg) : arg)) as never);
                },
            },
        },
        destination,
    );
}

/** Forwards the process logger's lines, so tests can read them without replacing the logger every module holds. */
const output = {
    target: stdout(),
    write(line: string) {
        this.target.write(line);
    },
};

/** Sends the process logger's lines to `destination`, or back to stdout without one. For tests. */
export function setLogDestination(destination?: DestinationStream) {
    output.target = destination ?? stdout();
}

/** The process logger. Inside a request, use `currentLogger()` or `logFor()` from request-context, which add the request id. */
export const logger = createLogger({ destination: output });
