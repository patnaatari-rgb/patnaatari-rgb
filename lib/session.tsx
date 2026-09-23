"use client";

import { useSyncExternalStore } from "react";

export type SessionRole = "super-admin" | "host-org-admin" | "kvk-admin" | "kvk-user";

export type Session = {
  role: SessionRole;
  kvkName?: string;
  hostOrgName?: string;
};

const DEFAULT_SESSION: Session = { role: "super-admin" };
const STORAGE_KEY = "atari-ams-session";

/**
 * Real auth now decides the role server-side (app/api/auth/login) - this
 * just mirrors that decision into sessionStorage so the rest of the app's
 * role-dependent UI (sidebar, Reports screen) keeps working exactly as
 * before, reading from the same client-side store.
 */
export function persistSession(session: Session) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event("atari-ams-session-change"));
}

/**
 * `silent` skips the store-change event. Use it on logout: firing the event
 * makes every `useSession()` reader fall back to the Super Admin default and
 * repaint for a frame, which on a KVK Admin looked like "Super Admin ki
 * jhalak" just before the hard navigation to /login tore the page down.
 */
export function clearSession(options?: { silent?: boolean }) {
  window.sessionStorage.removeItem(STORAGE_KEY);
  if (!options?.silent) window.dispatchEvent(new Event("atari-ams-session-change"));
}

/** Whether this tab already has a cached session - false in a fresh tab, where the role must be fetched from the server before rendering role-dependent chrome. */
export function hasStoredSession(): boolean {
  try {
    return !!window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

/**
 * sessionStorage, not localStorage - deliberately per-tab, not shared
 * across the whole browser. Multiple people can share one machine/browser
 * (e.g. a Super Admin's tab open next to someone else testing a KVK login
 * in another tab); localStorage would leak one tab's login into every
 * other open tab the instant it changed, silently "logging out" whoever
 * else was mid-session elsewhere. sessionStorage keeps each tab isolated.
 */
function subscribe(callback: () => void) {
  window.addEventListener("atari-ams-session-change", callback);
  return () => window.removeEventListener("atari-ams-session-change", callback);
}

let cachedRaw: string | null = null;
let cachedSnapshot: Session = DEFAULT_SESSION;

/**
 * useSyncExternalStore requires getSnapshot to return a stable (Object.is-equal)
 * reference when nothing changed. Re-parsing sessionStorage on every call would
 * hand back a new object each render, so React would treat that as a store
 * change every time and re-render forever. Caching the parsed value against
 * the raw string it came from keeps the reference stable across calls.
 */
function getSnapshot(): Session {
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedSnapshot;

  cachedRaw = raw;
  if (!raw) {
    cachedSnapshot = DEFAULT_SESSION;
    return cachedSnapshot;
  }
  try {
    cachedSnapshot = JSON.parse(raw) as Session;
  } catch {
    cachedSnapshot = DEFAULT_SESSION;
  }
  return cachedSnapshot;
}

function getServerSnapshot(): Session {
  return DEFAULT_SESSION;
}

/** Reads the mock session set at login - same value everywhere, no provider needed (backed by localStorage via useSyncExternalStore). */
export function useSession(): Session {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * False during server render and the very first client paint, true from the
 * moment the real session has actually been read out of sessionStorage.
 *
 * Needed because `getServerSnapshot` can only return the default (Super
 * Admin) session - the server has no way to know who is logged in. Without
 * this gate, a KVK Admin's first painted frame is Super Admin's UI, which
 * then swaps a moment later: the "Super Admin ki jhalak" flash on refresh.
 * Role-dependent chrome waits for this before rendering.
 */
export function useSessionReady(): boolean {
  return useSyncExternalStore(subscribeNever, getReadyTrue, getReadyFalse);
}

/** Readiness never changes after hydration, so there is nothing to subscribe to. */
function subscribeNever() {
  return () => {};
}
function getReadyTrue() {
  return true;
}
function getReadyFalse() {
  return false;
}
