"use client";

/**
 * 最近搜索记录 hook，负责在 localStorage 中维护知识搜索关键词历史。
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  RecentKnowledgeSearch,
  UseRecentKnowledgeSearchesOptions,
} from "@/features/knowledge/types";

const DEFAULT_STORAGE_KEY = "rag-creater:knowledge:recent-searches";
const DEFAULT_MAX_ITEMS = 8;

/** 提供最近搜索记录的读取、添加、删除和清空能力。 */
export function useRecentKnowledgeSearches(
  options: UseRecentKnowledgeSearchesOptions = {}
) {
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
  const maxItems = useMemo(
    () => normalizeMaxItems(options.maxItems),
    [options.maxItems]
  );
  const [searches, setSearches] = useState<RecentKnowledgeSearch[]>([]);

  useEffect(() => {
    const storedSearches = readSearches(storageKey).slice(0, maxItems);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage can only be read after client mount
    setSearches(storedSearches);
  }, [maxItems, storageKey]);

  /** 添加搜索词，重复关键词会移动到第一位。 */
  const addSearch = useCallback(
    (keyword: string) => {
      const normalizedKeyword = keyword.trim();
      if (!normalizedKeyword) return;

      setSearches((currentSearches) => {
        const nextSearches = [
          {
            keyword: normalizedKeyword,
            searchedAt: new Date().toISOString(),
          },
          ...currentSearches.filter(
            (item) => item.keyword !== normalizedKeyword
          ),
        ].slice(0, maxItems);

        writeSearches(storageKey, nextSearches);
        return nextSearches;
      });
    },
    [maxItems, storageKey]
  );

  /** 删除指定搜索词。 */
  const removeSearch = useCallback(
    (keyword: string) => {
      const normalizedKeyword = keyword.trim();
      if (!normalizedKeyword) return;

      setSearches((currentSearches) => {
        const nextSearches = currentSearches.filter(
          (item) => item.keyword !== normalizedKeyword
        );
        writeSearches(storageKey, nextSearches);
        return nextSearches;
      });
    },
    [storageKey]
  );

  /** 清空全部最近搜索记录。 */
  const clearSearches = useCallback(() => {
    setSearches([]);
    removeStoredSearches(storageKey);
  }, [storageKey]);

  return {
    searches,
    addSearch,
    removeSearch,
    clearSearches,
  };
}

/** 归一化最大记录数量，避免无效配置导致列表异常。 */
function normalizeMaxItems(maxItems?: number): number {
  if (maxItems === undefined) return DEFAULT_MAX_ITEMS;
  if (!Number.isFinite(maxItems)) return DEFAULT_MAX_ITEMS;
  return Math.max(1, Math.floor(maxItems));
}

/** 从 localStorage 读取最近搜索记录，读取失败时降级为空数组。 */
function readSearches(storageKey: string): RecentKnowledgeSearch[] {
  if (typeof window === "undefined") return [];

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) return [];

    const parsedValue: unknown = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) return [];

    return parsedValue.filter(isRecentKnowledgeSearch);
  } catch {
    return [];
  }
}

/** 将最近搜索记录写入 localStorage，写入失败时静默降级。 */
function writeSearches(
  storageKey: string,
  searches: RecentKnowledgeSearch[]
): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(searches));
  } catch {
    // localStorage may be unavailable in private mode or restricted browsers
  }
}

/** 从 localStorage 删除最近搜索记录，删除失败时静默降级。 */
function removeStoredSearches(storageKey: string): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // localStorage may be unavailable in private mode or restricted browsers
  }
}

/** 判断外部存储数据是否符合最近搜索记录结构。 */
function isRecentKnowledgeSearch(value: unknown): value is RecentKnowledgeSearch {
  return (
    typeof value === "object" &&
    value !== null &&
    "keyword" in value &&
    "searchedAt" in value &&
    typeof value.keyword === "string" &&
    typeof value.searchedAt === "string"
  );
}
