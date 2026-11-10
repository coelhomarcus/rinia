import { createContext, type ReactNode, use, useCallback, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { densityValues, type Density } from "@rinia/shared";
import { AUTH_QUERY_KEY, updateDensity, type AuthUser } from "@/features/auth/api";
import { useAuth } from "@/features/auth/hooks/use-auth";

const STORAGE_KEY = "rinia.density";
const pendingKey = (id: string) => `rinia.density.pending:${id}`;

export function isDensity(value: unknown): value is Density {
    return densityValues.includes(value as Density);
}

function readStorage(key: string): Density | null {
    try {
        const stored = localStorage.getItem(key);
        return isDensity(stored) ? stored : null;
    } catch {
        return null;
    }
}

interface DensityContextValue {
    density: Density;
    setDensity: (density: Density) => void;
    syncFailed: boolean;
    retrySync: () => void;
}

const DensityContext = createContext<DensityContextValue | null>(null);

/** Applies the choice at once, then saves it on the account. A failed save keeps it on this device and can be retried. */
export function DensityProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [density, setDensityState] = useState<Density>(() => readStorage(STORAGE_KEY) ?? "comfortable");
    const [syncFailed, setSyncFailed] = useState(false);
    const desired = useRef(density);
    const userRef = useRef(user);
    userRef.current = user;

    const paint = useCallback((next: Density) => {
        desired.current = next;
        setDensityState(next);
        document.documentElement.dataset.density = next;
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {
            /* The attribute still applies for this session. */
        }
    }, []);

    const persist = useCallback((next: Density, userId: string) => {
        try {
            localStorage.setItem(pendingKey(userId), next);
        } catch {
            /* The server save still runs. */
        }
        setSyncFailed(false);
        updateDensity(next)
            .then((updated) => {
                if (desired.current !== next || userRef.current?.id !== userId) return;
                queryClient.setQueryData<AuthUser>(AUTH_QUERY_KEY, updated);
                try {
                    localStorage.removeItem(pendingKey(userId));
                } catch {
                    /* The account already has the choice. */
                }
                setSyncFailed(false);
            })
            .catch(() => {
                if (desired.current === next) setSyncFailed(true);
            });
    }, [queryClient]);

    useLayoutEffect(() => {
        if (!user) {
            paint(readStorage(STORAGE_KEY) ?? "comfortable");
            setSyncFailed(false);
            return;
        }
        const pending = readStorage(pendingKey(user.id));
        const account = isDensity(user.density) ? user.density : "comfortable";
        paint(pending ?? account);
        if (pending && pending !== account) persist(pending, user.id);
        else {
            if (pending) {
                try {
                    localStorage.removeItem(pendingKey(user.id));
                } catch {
                    /* The account already matches. */
                }
            }
            setSyncFailed(false);
        }
    }, [paint, persist, user?.density, user?.id]);

    const setDensity = useCallback((next: Density) => {
        paint(next);
        if (userRef.current) persist(next, userRef.current.id);
    }, [paint, persist]);

    const retrySync = useCallback(() => {
        if (userRef.current) persist(desired.current, userRef.current.id);
    }, [persist]);

    return <DensityContext value={{ density, setDensity, syncFailed, retrySync }}>{children}</DensityContext>;
}

export function useDensity() {
    const value = use(DensityContext);
    if (!value) throw new Error("useDensity must be used within DensityProvider");
    return value;
}
