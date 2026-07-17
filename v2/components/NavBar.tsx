"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
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

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-10.5 bg-white border-b border-gray-200 shadow-md">
      <NavigationMenu className="max-w-full w-full h-full gap-2 flex">
        <NavigationMenuList className="h-full px-2 gap-2 w-full justify-start">
          {links.map(({ href, label }) => {
            const isActive = pathname === href;
            return (
              <NavigationMenuItem
                key={href}
                // className={cn(mlAuto && "ml-auto")}
              >
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
        </NavigationMenuList>
      </NavigationMenu>
    </nav>
  );
}
