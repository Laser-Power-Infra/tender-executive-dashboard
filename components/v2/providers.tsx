"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SessionProvider, useSession } from "next-auth/react";
import { Toaster } from "sonner";
import StoreProvider from "@/lib/store-provider";
import { TooltipProvider } from "@/components/v2/ui/overlay";

// Same storage keys as v1, so the theme follows the user across both shells.
export const bootScript = `try{var d=document.documentElement;if(localStorage.getItem("theme")==="dark"){d.classList.add("dark");document.cookie="theme=dark;path=/;max-age=31536000;samesite=lax"}if(localStorage.getItem("v2-sidebar")==="collapsed")d.dataset.sidebar="collapsed";if(localStorage.getItem("v2-dev-mode")==="off")d.dataset.dev="off"}catch(e){}`;

function subscribeRoot(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-sidebar", "data-dev"],
  });
  return () => observer.disconnect();
}

export function useIsDark() {
  return useSyncExternalStore(
    subscribeRoot,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
}

export function setDark(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem("theme", dark ? "dark" : "light");
  } catch {}
  // The server reads this to render the class; localStorage alone is lost when React rebuilds <html>.
  document.cookie = `theme=${dark ? "dark" : "light"};path=/;max-age=31536000;samesite=lax`;
}

export function useSidebarCollapsed() {
  return useSyncExternalStore(
    subscribeRoot,
    () => document.documentElement.dataset.sidebar === "collapsed",
    () => false,
  );
}

export function setSidebarCollapsed(collapsed: boolean) {
  const root = document.documentElement;
  if (collapsed) root.dataset.sidebar = "collapsed";
  else delete root.dataset.sidebar;
  try {
    localStorage.setItem("v2-sidebar", collapsed ? "collapsed" : "open");
  } catch {}
}

/** The developer's own switch; on unless they turned it off in this browser. */
export function useDeveloperMode() {
  return useSyncExternalStore(
    subscribeRoot,
    () => document.documentElement.dataset.dev !== "off",
    () => true,
  );
}

export function setDeveloperMode(on: boolean) {
  const root = document.documentElement;
  if (on) delete root.dataset.dev;
  else root.dataset.dev = "off";
  try {
    localStorage.setItem("v2-dev-mode", on ? "on" : "off");
  } catch {}
}

/** Show developer tools: a developer with developer mode on. Access is still checked on the server. */
export function useIsDeveloper() {
  const developerMode = useDeveloperMode();
  return useSession().data?.user?.role === "developer" && developerMode;
}

/**
 * Signed in, Pip says every toast (components/v2/assistant), so the Toaster
 * only shows on the sign-in pages and while signed out, where Pip is absent.
 */
function ThemedToaster() {
  const isDark = useIsDark();
  const { status } = useSession();
  const pathname = usePathname();
  if (status === "authenticated" && !pathname.startsWith("/auth")) return null;
  return <Toaster richColors theme={isDark ? "dark" : "light"} />;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <StoreProvider>
        <TooltipProvider delay={500} timeout={400}>
          {children}
        </TooltipProvider>
        <ThemedToaster />
      </StoreProvider>
    </SessionProvider>
  );
}
