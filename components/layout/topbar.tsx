"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Bell, ChevronDown, KeyRound, LogOut, User } from "lucide-react";
import { WavingFlag } from "./waving-flag";
import { LiveClock } from "./live-clock";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clearSession, useSession, useSessionReady } from "@/lib/session";
import { ChangePasswordDialog } from "./change-password-dialog";

/**
 * Fixed top bar shown above every dashboard page: zone title on the left,
 * notifications + current user on the right. The signed-in identity comes
 * from the mock session set at login (lib/session.ts) - real auth (Phase
 * 2/3) replaces that mock with an actual authenticated user, but the shape
 * (role decided once, at login) doesn't change.
 */
type NotifItem = { id: string; title: string; from: string; sentOn: string; createdAt: string };
const NOTIF_SEEN_KEY = "ams-notif-last-seen";

function readSeen(): number {
  try {
    return Number(localStorage.getItem(NOTIF_SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function Topbar() {
  const router = useRouter();
  const session = useSession();
  const sessionReady = useSessionReady();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const [received, setReceived] = useState<NotifItem[]>([]);
  const [lastSeen, setLastSeen] = useState<number>(() =>
    typeof window === "undefined" ? 0 : readSeen(),
  );

  const loadNotifications = useCallback(() => {
    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : { received: [] }))
      .then((data: { received?: NotifItem[] }) => setReceived(data.received ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const unreadCount = received.filter((n) => new Date(n.createdAt).getTime() > lastSeen).length;

  const markSeen = useCallback(() => {
    const now = Date.now();
    try {
      localStorage.setItem(NOTIF_SEEN_KEY, String(now));
    } catch {
      // per-device convenience only - fine if storage is unavailable
    }
    setLastSeen(now);
  }, []);

  /**
   * Before the real session has been read out of sessionStorage, `session`
   * is only ever the hardcoded default (Super Admin) - rendering that
   * directly is exactly the "wrong role flashes for a moment" bug (a KVK
   * Admin's first frame reads "Super Administrator" until this swaps a
   * moment later). Blank until ready instead of guessing.
   */
  const displayName = !sessionReady
    ? ""
    : session.role === "super-admin"
      ? "Super Administrator"
      : session.role === "host-org-admin"
        ? (session.hostOrgName ?? "Host Organisation")
        : (session.kvkName ?? "KVK Admin");
  const roleLabel = !sessionReady
    ? ""
    : session.role === "super-admin"
      ? "ATARI Super Admin"
      : session.role === "host-org-admin"
        ? "Host Organisation Admin"
        : session.role === "kvk-admin"
          ? "KVK Admin"
          : "KVK User";

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-6">
      <div className="flex flex-1 items-center">
        <LiveClock className="hidden whitespace-nowrap text-sm text-muted-foreground tabular-nums sm:block" />
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <Image
          src="/brand/zone-seal-patna.png"
          alt="ATARI Zone IV Patna"
          width={120}
          height={120}
          priority
          className="size-11 shrink-0 rounded-full"
        />
        <p className="whitespace-nowrap text-base font-semibold text-primary sm:text-lg">
          AMS - ATARI Zone (IV) Patna
        </p>
        <Image
          src="/brand/icar-logo.png"
          alt="ICAR"
          width={90}
          height={120}
          priority
          className="h-11 w-auto shrink-0"
        />
      </div>

      <div className="flex flex-1 items-center justify-end gap-5">
        <DropdownMenu
          onOpenChange={(open) => {
            /**
             * Real bug fix, 2026-09-14 - `received` was only ever fetched
             * once, on the very first mount of this shell (client report:
             * deleted a notification on the /notifications page, but the
             * bell up top kept showing it). This shell stays mounted across
             * client-side navigation, so opening the bell is the one
             * reliable moment to catch anything deleted/added elsewhere -
             * refetch every time it opens, not just once ever.
             */
            if (open) {
              loadNotifications();
              if (unreadCount > 0) markSeen();
            }
          }}
        >
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={
                  unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
                }
                className="relative text-muted-foreground transition-colors outline-none hover:text-foreground"
              >
                <Bell className="size-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            }
          />
          <DropdownMenuContent align="end" className="w-80 min-w-0">
            <p className="px-1.5 py-1.5 text-sm font-medium text-foreground">Notifications</p>
            <DropdownMenuSeparator />
            {received.length === 0 ? (
              <p className="px-1.5 py-3 text-center text-sm text-muted-foreground">
                No notifications yet.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                {received.slice(0, 6).map((n) => {
                  const isUnread = new Date(n.createdAt).getTime() > lastSeen;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => router.push("/notifications")}
                      className="flex w-full flex-col gap-0.5 border-b border-border/60 px-2 py-2 text-left last:border-0 hover:bg-primary hover:text-primary-foreground"
                    >
                      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        {isUnread && <span className="size-1.5 shrink-0 rounded-full bg-destructive" />}
                        <span className="truncate">{n.title}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {n.from} · {n.sentOn}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/notifications")}>
              View all notifications
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <WavingFlag className="h-7 w-10" />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex items-center gap-2 outline-none"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <User className="size-4.5" strokeWidth={1.75} />
                </span>
                <span className="flex items-center gap-1 leading-tight">
                  <span className="text-left">
                    <p className="text-sm font-medium">{displayName}</p>
                    <p className="text-xs text-muted-foreground">{roleLabel}</p>
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground" />
                </span>
              </button>
            }
          />
          <DropdownMenuContent align="end" className="w-max min-w-40 whitespace-nowrap">
            <DropdownMenuItem onClick={() => setChangePasswordOpen(true)}>
              <KeyRound className="size-3.5" />
              Change Password
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                /**
                 * Hard navigation, not router.push: a soft nav keeps this
                 * dashboard shell mounted for a beat, and clearSession()
                 * makes useSession() fall back to its Super Admin default in
                 * the meantime - so a KVK Admin logging out saw a flash of
                 * Super Admin chrome. A full page load tears everything down
                 * at once, no in-between render. `replace` so Back doesn't
                 * return to the now-logged-out dashboard.
                 *
                 * `silent: true` - even with the hard nav, a plain
                 * clearSession() fires the store-change event and React
                 * flushes one re-render (topbar -> "Super Administrator")
                 * before the browser unloads. Skipping the event keeps the
                 * real identity on screen right up until the page goes.
                 */
                fetch("/api/auth/logout", { method: "POST" }).finally(() => {
                  clearSession({ silent: true });
                  window.location.replace("/login");
                });
              }}
            >
              <LogOut className="size-3.5" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ChangePasswordDialog
        open={changePasswordOpen}
        onOpenChange={setChangePasswordOpen}
      />
    </header>
  );
}
