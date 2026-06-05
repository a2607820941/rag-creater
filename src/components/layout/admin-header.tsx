import { PanelRightClose, PanelRightOpen } from "lucide-react";

import { Button } from "@/components/ui/button";

export type AdminHeaderProps = {
  title: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
};

export function AdminHeader({
  title,
  sidebarOpen,
  onToggleSidebar,
}: AdminHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          aria-label={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
          onClick={onToggleSidebar}
          size="icon"
          type="button"
          variant="ghost"
        >
          {sidebarOpen ? (
            <PanelRightOpen aria-hidden="true" className="size-4" />
          ) : (
            <PanelRightClose aria-hidden="true" className="size-4" />
          )}
        </Button>
        <h1 className="truncate text-base font-semibold text-foreground">
          {title}
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-2 rounded-md border border-border bg-card px-2 py-1">
        <div className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
          管
        </div>
        <span className="text-sm font-medium text-foreground">管理员</span>
      </div>
    </header>
  );
}
