"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearSession,
  hasStoredSession,
  persistSession,
  useSessionReady,
  type SessionRole,
} from "@/lib/session";

/**
 * Holds back the whole role-dependent dashboard shell until the real session
 * is known.
 *
 * The per-tab sessionStorage copy (see lib/session.tsx) is the fast path, but
 * it is absent in a brand-new tab and can go stale, and its fallback is Super
 * Admin - which is why a KVK Admin opening the app in a second tab briefly
 * (or not so briefly) saw Super Admin's sidebar and name. So on mount this
 * also asks the server (`/api/auth/me`, backed by the httpOnly cookie) for
 * the true identity and writes it back:
 *   - fresh tab (no cached session): block on the fetch, then render.
 *   - cached session present: render immediately, reconcile in the background
 *     (persistSession fires the store-change event, so the chrome corrects
 *     itself the moment the answer lands).
 *
 * The placeholder mirrors the real layout's geometry so nothing shifts.
 */
export function SessionGate({ children }: { children: React.ReactNode }) {
  const ready = useSessionReady();
  const router = useRouter();
  const [needsHydration, setNeedsHydration] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return !hasStoredSession();
  });

  useEffect(() => {
    let cancelled = false;
    const hadStored = hasStoredSession();
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        if (res.ok) return { kind: "ok" as const, data: await res.json() };
        return { kind: "error" as const, status: res.status };
      })
      .then(
        (
          result:
            | { kind: "ok"; data: { role?: SessionRole; kvkName?: string; hostOrgName?: string } | null }
            | { kind: "error"; status: number },
        ) => {
          if (cancelled) return;

          if (result.kind === "ok") {
            const role = result.data?.role;
            if (
              role === "super-admin" ||
              role === "host-org-admin" ||
              role === "kvk-admin" ||
              role === "kvk-user"
            ) {
              persistSession({ role, kvkName: result.data?.kvkName, hostOrgName: result.data?.hostOrgName });
              setNeedsHydration(false);
              return;
            }
          }

          // Cookie is gone or rejected: never keep rendering the shell off a
          // stale sessionStorage copy (its fallback role is Super Admin) -
          // drop it and go to /login so the user re-authenticates cleanly.
          if (result.kind === "error" && (result.status === 401 || result.status === 403)) {
            clearSession({ silent: true });
            router.replace("/login");
            return;
          }

          // Any other failure (5xx, unexpected body): don't trap the user on a
          // blank shell - fall through to the cached session if there is one,
          // otherwise send them to login.
          if (!hadStored) {
            router.replace("/login");
            return;
          }
          setNeedsHydration(false);
        },
      )
      .catch(() => {
        if (!cancelled) setNeedsHydration(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready || needsHydration) {
    return (
      <div className="flex h-screen overflow-hidden bg-background" aria-hidden>
        <div className="w-64 shrink-0 bg-sidebar" />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="h-16 shrink-0 border-b border-border bg-card" />
          <div className="flex-1" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
