"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
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
];

const adminLinks = [
  { href: "/admin/mappings", label: "Column Mappings" },
  { href: "/admin/indices", label: "Column Index" },
  { href: "/admin/merging", label: "Column Merging" },
];

export function NavBar() {
  const pathname = usePathname();

  const isAdminActive = adminLinks.some((l) => pathname === l.href);

  return (
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

          <NavigationMenuItem className="ml-auto relative">
            <div className="group inline-flex">
              <button
                className={cn(
                  "px-3 py-1.5 rounded text-sm font-semibold transition-colors inline-flex items-center gap-1 hover:bg-[#0a2540] hover:text-white",
                  isAdminActive
                    ? "bg-[#0a2540] text-white"
                    : "text-gray-700",
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
        </NavigationMenuList>
      </NavigationMenu>
    </nav>
  );
}
