import {
  Bot,
  BrainCircuit,
  FolderKanban,
  LayoutDashboard,
  MessageSquareMore,
  NotebookTabs,
  SquareLibrary,
  type LucideIcon,
} from "lucide-react";

export type NavMatchMode = "exact" | "prefix";

export type AdminNavChildItem = {
  label: string;
  title: string;
  href: string;
  Icon: LucideIcon;
  match?: NavMatchMode;
  activePatterns?: string[];
};

export type AdminNavItem = {
  label: string;
  title: string;
  href: string;
  Icon: LucideIcon;
  match?: NavMatchMode;
  activePatterns?: string[];
  children?: AdminNavChildItem[];
};

export const adminNavItems = [
  {
    label: "数据总览",
    title: "Dashboard 数据总览",
    href: "/dashboard",
    Icon: LayoutDashboard,
    match: "prefix",
  },
  {
    label: "知识库",
    title: "知识库管理",
    href: "/knowledge-bases",
    Icon: BrainCircuit,
    activePatterns: ["/knowledge-bases", "/note"],
    children: [
      {
        label: "知识库管理",
        title: "知识库管理",
        href: "/knowledge-bases",
        Icon: SquareLibrary,
        match: "prefix",
      },
      {
        label: "知识笔记",
        title: "知识笔记",
        href: "/note",
        Icon: NotebookTabs,
        match: "prefix",
      },
    ],
  },
  {
    label: "知识文档",
    title: "知识文档",
    href: "/documents",
    Icon: FolderKanban,
    match: "prefix",
  },
  {
    label: "专家 Agent",
    title: "专家 Agent",
    href: "/agents",
    Icon: Bot,
    match: "exact",
  },
  {
    label: "专家对话",
    title: "专家对话",
    href: "/agents/chat",
    Icon: MessageSquareMore,
    match: "prefix",
  },
] satisfies AdminNavItem[];

export function matchHref(
  pathname: string,
  href: string,
  match: NavMatchMode = "prefix"
) {
  if (match === "exact") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isNavChildActive(item: AdminNavChildItem, pathname: string) {
  const patternActive = item.activePatterns?.some((pattern) =>
    matchHref(pathname, pattern)
  );

  return patternActive ?? matchHref(pathname, item.href, item.match);
}

export function isNavItemActive(item: AdminNavItem, pathname: string) {
  const selfActive =
    item.activePatterns?.some((pattern) => matchHref(pathname, pattern)) ??
    matchHref(pathname, item.href, item.match);

  const childActive = item.children?.some((child) =>
    isNavChildActive(child, pathname)
  );

  return Boolean(selfActive || childActive);
}

export function getAdminPageTitle(pathname: string) {
  for (const item of adminNavItems) {
    for (const child of item.children ?? []) {
      if (isNavChildActive(child, pathname)) {
        return child.title;
      }
    }
  }

  const activeItem = adminNavItems.find((item) =>
    matchHref(pathname, item.href, item.match)
  );

  return activeItem?.title ?? "知识库管理";
}
