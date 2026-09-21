"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { pageTitleFor } from "@/lib/page-title";

/** Keeps the browser tab title in step with the current dashboard page (the server-rendered title is the same for every page). */
export function DocumentTitle() {
  const pathname = usePathname();
  useEffect(() => {
    document.title = pageTitleFor(pathname);
  }, [pathname]);
  return null;
}
