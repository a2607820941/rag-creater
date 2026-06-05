"use client";

import Link from "next/link";
import * as React from "react";
import { ChevronDown, LibraryBig } from "lucide-react";

import {
  adminNavItems,
  isNavChildActive,
  isNavItemActive,
} from "@/components/layout/admin-nav";
import { cn } from "@/lib/utils";

export type AdminSidebarProps = {
  sidebarOpen: boolean;
  pathname: string;
  sidebarContent?: React.ReactNode;
};

export function AdminSidebar({
  sidebarContent,
  sidebarOpen,
  pathname,
}: AdminSidebarProps) {
  const [collapsedParents, setCollapsedParents] = React.useState<
    Record<string, boolean>
  >({});

  function toggleParent(href: string) {
    setCollapsedParents((current) => ({
      ...current,
      [href]: !current[href],
    }));
  }

  return (
    <aside
      className={cn(
        "flex min-h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        sidebarOpen ? "w-60" : "w-[72px]"
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center border-b border-sidebar-border px-4",
          sidebarOpen ? "justify-start gap-2" : "justify-center"
        )}
      >
        <div className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <LibraryBig aria-hidden="true" className="size-4" />
        </div>
        {sidebarOpen ? (
          <span className="truncate text-sm font-semibold">
            AI知识库管理平台
          </span>
        ) : null}
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        {adminNavItems.map((item) => {
          const active = isNavItemActive(item, pathname);
          const Icon = item.Icon;
          const hasChildren = Boolean(item.children?.length);
          const expanded =
            sidebarOpen && active && hasChildren && !collapsedParents[item.href];

          return (
            <div className="flex flex-col gap-1" key={item.href}>
              <Link
                aria-current={active && !hasChildren ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center rounded-md text-sm font-medium transition-colors",
                  sidebarOpen
                    ? "justify-start gap-2 px-3"
                    : "justify-center px-0",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
                href={item.href}
                onClick={(event) => {
                  if (!hasChildren || !active) return;
                  event.preventDefault();
                  toggleParent(item.href);
                }}
                title={sidebarOpen ? undefined : item.label}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                {sidebarOpen ? (
                  <>
                    <span className="min-w-0 flex-1 truncate">
                      {item.label}
                    </span>
                    {hasChildren ? (
                      <ChevronDown
                        aria-hidden="true"
                        className={cn(
                          "size-3.5 shrink-0 transition-transform",
                          expanded ? "rotate-180" : "rotate-0"
                        )}
                      />
                    ) : null}
                  </>
                ) : null}
              </Link>

              {expanded ? (
                <div className="ml-4 flex flex-col gap-1 border-l border-sidebar-border pl-2">
                  {item.children?.map((child) => {
                    const childActive = isNavChildActive(child, pathname);
                    const ChildIcon = child.Icon;

                    return (
                      <Link
                        aria-current={childActive ? "page" : undefined}
                        className={cn(
                          "flex h-8 items-center gap-2 rounded-md px-3 text-sm transition-colors",
                          childActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                        href={child.href}
                        key={child.href}
                      >
                        <ChildIcon
                          aria-hidden="true"
                          className="size-4 shrink-0"
                        />
                        <span className="truncate">{child.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
        {sidebarOpen && sidebarContent ? (
          <div className="mt-3 border-t border-sidebar-border pt-3">
            {sidebarContent}
          </div>
        ) : null}
      </nav>
    </aside>
  );
}
