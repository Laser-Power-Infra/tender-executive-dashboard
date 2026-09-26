"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchFiles } from "@/lib/slices/filesSlice";
import { fetchAllTenders } from "@/lib/slices/tendersSlice";
import { fetchAllBomOptions } from "@/lib/slices/utilitySlice";

/**
 * Routes that actually read `state.tenders.data` / `state.utility.bomByItemName`.
 *
 * This component is mounted from the root layout, so without this gate every
 * route — including `/auth/login`, `/sop`, `/activity` and `/admin/*` — paid for
 * streaming the entire tender table into Redux without ever reading it.
 */
const TENDER_DATA_ROUTES = [
  "/",
  // "/tenders" is deliberately absent: it pages through the data server-side
  // now, so streaming all ~34k rows there would be pure waste.
  "/post-participation",
  "/not-participated",
  "/merge-conflict",
];

/**
 * Routes that still need the whole table in the browser.
 *
 * The three executive dashboards page server-side now, so only the
 * merge-conflict view - which compares rows against each other - still reads
 * `state.tenders.data.rows`. They do still need the file list and the BOM
 * options, which are small.
 */
const TENDER_STREAM_ROUTES = ["/merge-conflict"];

function matchesRoute(routes: string[], pathname: string | null): boolean {
  if (!pathname) return false;
  return routes.some((route) =>
    route === "/" ? pathname === "/" : pathname.startsWith(route),
  );
}

function needsTenderData(pathname: string | null): boolean {
  return matchesRoute(TENDER_DATA_ROUTES, pathname);
}

export function DataLoader({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const hasFiles = useAppSelector((s) => s.files.items.length > 0);
  const pathname = usePathname();
  const enabled = needsTenderData(pathname);
  const needsStream = matchesRoute(TENDER_STREAM_ROUTES, pathname);

  // The tender stream is expensive enough that it must run at most once per
  // mount. `state.files.items` gets a fresh array identity on every
  // fetchFiles.fulfilled, so keying the effect on it re-downloaded the whole
  // dataset whenever the file list refreshed.
  const tendersRequestedRef = useRef(false);
  // `enabled` flips false -> true on every return to a gated route, so without
  // this guard the file list was re-downloaded on each page switch.
  const filesRequestedRef = useRef(false);

  useEffect(() => {
    if (!enabled || filesRequestedRef.current) return;
    filesRequestedRef.current = true;
    dispatch(fetchFiles());
  }, [dispatch, enabled]);

  useEffect(() => {
    if (!enabled || !hasFiles || tendersRequestedRef.current) return;
    tendersRequestedRef.current = true;
    // Bom options populate utilitySlice for O(1) dropdown lookup, and every
    // gated route needs them; only merge-conflict needs the row stream.
    if (needsStream) dispatch(fetchAllTenders());
    dispatch(fetchAllBomOptions());
  }, [hasFiles, dispatch, enabled, needsStream]);

  return <>{children}</>;
}
