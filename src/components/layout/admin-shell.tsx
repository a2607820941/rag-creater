"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { AdminHeader } from "@/components/layout/admin-header";
import { getAdminPageTitle } from "@/components/layout/admin-nav";
import { AdminSidebar } from "@/components/layout/admin-sidebar";

export type AdminShellProps = {
  children: React.ReactNode;
  sidebarContent?: React.ReactNode;
};

export function AdminShell({ children, sidebarContent }: AdminShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = React.useState(true);

  const title = getAdminPageTitle(pathname);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <AdminSidebar
        pathname={pathname}
        sidebarContent={sidebarContent}
        sidebarOpen={sidebarOpen}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          sidebarOpen={sidebarOpen}
          title={title}
        />
        <main className="min-h-0 flex-1 overflow-auto bg-muted/30 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
