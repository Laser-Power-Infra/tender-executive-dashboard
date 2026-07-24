"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { ChevronDown, LogIn, LogOut, User, UserPlus } from "lucide-react";
import { UnderChangesBanner } from "@/components/UnderChangesBanner";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from "@/components/ui/navigation-menu";

const links = [
  { href: "/", label: "Executive Dashboard" },
  { href: "/supply-history", label: "Supply History Dashboard" },
  { href: "/tenders", label: "Tenders" },
  { href: "/activity", label: "Activity" },
];

const adminLinks = [
  { href: "/admin/mappings", label: "Column Mappings" },
  { href: "/admin/indices", label: "Column Index" },
  { href: "/admin/merging", label: "Column Merging" },
];

function UserAvatar({
  name,
  email,
}: {
  name?: string | null;
  email?: string | null;
}) {
  const initials = (name || email || "U")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0a2540] text-xs font-bold text-white">
      {initials}
    </div>
  );
}

export function NavBar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated";
  const isAdminActive = adminLinks.some((l) => pathname === l.href);

  return (
    <>
      <UnderChangesBanner />
      <nav className="fixed top-0 left-0 right-0 z-50 h-10.5 bg-white border-b border-gray-200 shadow-md">
      <NavigationMenu className="max-w-full w-full h-full gap-2 flex">
        <NavigationMenuList className="h-full px-2 gap-2 w-full justify-start">
          {links.map(({ href, label }) => {
            const isActive = pathname === href;
            return (
              <NavigationMenuItem key={href}>
                <NavigationMenuLink
                  render={<Link href={href} />}
                  className={cn(
                    "px-3 py-1.5 rounded text-sm font-semibold transition-colors hover:bg-[#0a2540] hover:text-white",
                    isActive
                      ? "bg-[#0a2540] text-white data-active:bg-[#0a2540] data-active:text-white"
                      : "text-gray-700 data-active:bg-transparent data-active:text-gray-700",
                  )}
                >
                  {label}
                </NavigationMenuLink>
              </NavigationMenuItem>
            );
          })}
          {isAuthenticated && (
            <NavigationMenuItem className="ml-auto relative">
              <div className="group inline-flex">
                <button
                  className={cn(
                    "px-3 py-1.5 rounded text-sm font-semibold transition-colors inline-flex items-center gap-1 hover:bg-[#0a2540] hover:text-white",
                    isAdminActive ? "bg-[#0a2540] text-white" : "text-gray-700",
                  )}
                >
                  Admin <ChevronDown size={14} />
                </button>
                <div className="absolute right-0 top-full mt-0.5 w-48 bg-white border border-gray-200 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
                  {adminLinks.map(({ href, label }) => {
                    const isActive = pathname === href;
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={cn(
                          "block px-4 py-2 text-sm transition-colors hover:bg-gray-100",
                          isActive
                            ? "bg-gray-50 font-semibold text-[#0a2540]"
                            : "text-gray-700",
                        )}
                      >
                        {label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </NavigationMenuItem>
          )}
        </NavigationMenuList>

        <div className="flex items-center gap-2 px-3 ml-auto">
          {status === "loading" ? (
            <div className="h-8 w-8 animate-pulse rounded-full bg-gray-200" />
          ) : isAuthenticated ? (
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-gray-600 sm:block">
                {session?.user?.name || session?.user?.email}
              </span>
              <div className="group relative">
                <button className="flex items-center gap-1 rounded-lg p-1 transition-colors hover:bg-gray-100">
                  <UserAvatar
                    name={session?.user?.name}
                    email={session?.user?.email}
                  />
                </button>
                <div className="absolute right-0 top-full mt-1 hidden w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg group-hover:block">
                  <div className="border-b border-gray-100 px-3 py-2">
                    <p className="truncate text-xs font-medium text-gray-900">
                      {session?.user?.name || "User"}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {session?.user?.email}
                    </p>
                  </div>
                  <button
                    onClick={() => signOut()}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    <LogOut size={14} />
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <Link
                href="/auth/signup"
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100"
              >
                <UserPlus size={14} />
                Sign Up
              </Link>
              <button
                onClick={() => signIn()}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#0a2540] transition-colors hover:bg-gray-100"
              >
                <LogIn size={14} />
                Sign In
              </button>
            </>
          )}
        </div>
      </NavigationMenu>
    </nav>
    </>
  );
}
