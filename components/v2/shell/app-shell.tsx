"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Code,
  KeyRound,
  LogIn,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
} from "lucide-react";
import { changePassword } from "@/actions/auth";
import { cn } from "@/lib/utils";
import {
  setDark,
  setDeveloperMode,
  setSidebarCollapsed,
  useIsDark,
  useDeveloperMode,
  useIsDeveloper,
  useSidebarCollapsed,
} from "@/components/v2/providers";
import { Button, IconButton } from "@/components/v2/ui/button";
import { toastError } from "@/components/v2/ui/errors";
import { Assistant } from "@/components/v2/assistant/assistant";
import { Field, Input } from "@/components/v2/ui/field";
import {
  Dialog,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuSwitchItem,
  Tip,
} from "@/components/v2/ui/overlay";
import { Skeleton } from "@/components/v2/ui/page";
import { NAV_GROUPS, type NavItem } from "./nav-items";
import { say } from "@/lib/pip-says";

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const className = cn(
    "press flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-md",
    active
      ? "bg-surface font-medium text-ink card"
      : "not-disabled:hover:bg-hover text-ink-2",
  );
  const content = (
    <>
      <Icon
        className={cn("size-4 shrink-0", active ? "text-accent" : "text-ink-3")}
        aria-hidden
      />
      <span className="in-data-[sidebar=collapsed]:hidden truncate">{item.label}</span>
    </>
  );
  // v1 pages live under a different root layout, so they need a document load.
  const link = item.v2 ? (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
      className={className}
    >
      {content}
    </Link>
  ) : (
    <a href={item.href} aria-label={item.label} className={className}>
      {content}
    </a>
  );
  return collapsed ? (
    <Tip label={item.label} side="right">
      {link}
    </Tip>
  ) : (
    link
  );
}

function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const formId = useId();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await changePassword({ oldPassword, newPassword });
      toast.success(say.passwordChanged());
      setOldPassword("");
      setNewPassword("");
      onOpenChange(false);
    } catch (err) {
      toastError(say.couldNot("change your password"), err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Change password"
      width="24rem"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={saving}>
            Change password
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Current password">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
          />
        </Field>
        <Field label="New password">
          <Input
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </Field>
      </form>
    </Dialog>
  );
}

function UserArea() {
  const { data: session, status } = useSession();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const developerMode = useDeveloperMode();

  if (status === "loading") {
    return <Skeleton className="h-8 w-full" />;
  }

  if (status !== "authenticated") {
    return (
      <button
        type="button"
        onClick={() => signIn()}
        aria-label="Sign in"
        className="press not-disabled:hover:bg-hover flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-ink-2"
      >
        <LogIn className="size-4 shrink-0 text-ink-3" aria-hidden />
        <span className="in-data-[sidebar=collapsed]:hidden">Sign in</span>
      </button>
    );
  }

  const name = session.user?.name || session.user?.email || "User";
  const initials = name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <>
      <Menu
        side="top"
        trigger={
          <button
            type="button"
            aria-label={`Account: ${name}`}
            className="press not-disabled:hover:bg-hover flex h-9 w-full items-center gap-2.5 rounded-lg px-1.5 text-left"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-3xs font-semibold text-on-accent">
              {initials}
            </span>
            <span className="in-data-[sidebar=collapsed]:hidden min-w-0 flex-1 truncate text-ink">
              {name}
            </span>
          </button>
        }
      >
        <div className="px-2 pb-1.5 pt-1">
          <div className="truncate font-medium">{name}</div>
          <div className="truncate text-xs text-ink-3">{session.user?.email}</div>
        </div>
        <MenuSeparator />
        {session.user?.role === "developer" && (
          <MenuSwitchItem icon={<Code />} checked={developerMode} onCheckedChange={setDeveloperMode}>
            Developer mode
          </MenuSwitchItem>
        )}
        <MenuItem icon={<KeyRound />} onClick={() => setPasswordOpen(true)}>
          Change password
        </MenuItem>
        <MenuItem icon={<LogOut />} onClick={() => signOut()}>
          Sign out
        </MenuItem>
      </Menu>
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const collapsed = useSidebarCollapsed();
  const isDark = useIsDark();
  const isDeveloper = useIsDeveloper();
  const role = useSession().data?.user?.role;
  const isAdmin = role === "admin" || role === "developer";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarCollapsed(document.documentElement.dataset.sidebar !== "collapsed");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Sign-in and account creation have their own frame.
  if (pathname.startsWith("/auth")) return <>{children}</>;

  return (
    <div className="h-dvh">
      <aside className="w-(--sidebar-w) in-data-[sidebar=collapsed]:w-(--sidebar-rail-w) fixed inset-y-0 left-0 z-(--z-rail) flex flex-col overflow-hidden border-r bg-rail">
        <div className="flex h-12 shrink-0 items-center gap-2 px-3">
          <span className="in-data-[sidebar=collapsed]:hidden min-w-0 flex-1 truncate pl-1 text-md font-semibold tracking-[-0.01em]">
            Tender Dashboard
          </span>
          <IconButton
            label={collapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
            aria-expanded={!collapsed}
            onClick={() => setSidebarCollapsed(!collapsed)}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </IconButton>
        </div>

        <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {NAV_GROUPS.filter(
            (g) => (!g.developerOnly || isDeveloper) && (!g.adminOnly || isAdmin),
          ).map((group) => (
            <div key={group.label} className="mt-3 first:mt-1">
              <div className="in-data-[sidebar=collapsed]:hidden px-2.5 pb-1 type-label text-ink-3">
                {group.label}
              </div>
              <ul className="flex flex-col gap-px">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <NavLink
                      item={item}
                      active={pathname === item.href}
                      collapsed={collapsed}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex shrink-0 flex-col gap-px border-t p-2">
          <button
            type="button"
            onClick={() => setDark(!isDark)}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="press not-disabled:hover:bg-hover flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-ink-2"
          >
            {isDark ? (
              <Sun className="size-4 shrink-0 text-ink-3" aria-hidden />
            ) : (
              <Moon className="size-4 shrink-0 text-ink-3" aria-hidden />
            )}
            <span className="in-data-[sidebar=collapsed]:hidden">{isDark ? "Light mode" : "Dark mode"}</span>
          </button>
          <UserArea />
        </div>
      </aside>

      <main className="pl-(--sidebar-w) in-data-[sidebar=collapsed]:pl-(--sidebar-rail-w) h-full min-w-0">{children}</main>
      <Assistant />
    </div>
  );
}
