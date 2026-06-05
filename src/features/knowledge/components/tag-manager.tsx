"use client";

/**
 * 标签管理组件，封装标签查询、创建和删除的完整交互。
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createTag,
  deleteTag,
  fetchTags,
} from "@/features/knowledge/api/tags";
import { TagForm } from "@/features/knowledge/components/tag-form";
import type {
  KnowledgeTagDto,
  KnowledgeTagFormValues,
} from "@/features/knowledge/types";

/** 标签管理组件参数。 */
type TagManagerProps = {
  title?: string;
  description?: string;
};

/** 提供标签列表、创建和删除能力的可嵌入管理组件。 */
export function TagManager({
  title = "标签管理",
  description = "维护知识标签，后续可接入知识列表多选筛选。",
}: TagManagerProps) {
  const [tags, setTags] = useState<KnowledgeTagDto[]>([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const trimmedKeyword = useMemo(() => keyword.trim(), [keyword]);

  /** 按当前关键词从 API 刷新标签列表。 */
  const loadTags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTags({ keyword: trimmedKeyword });
      setTags(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载标签失败");
    } finally {
      setLoading(false);
    }
  }, [trimmedKeyword]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard data fetching on mount/filter change
    void loadTags();
  }, [loadTags]);

  /** 创建标签并刷新列表。 */
  const handleCreate = async (values: KnowledgeTagFormValues) => {
    setSubmitting(true);
    setError(null);
    try {
      await createTag(values);
      setShowCreateForm(false);
      await loadTags();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建标签失败");
    } finally {
      setSubmitting(false);
    }
  };

  /** 二次确认后删除指定标签并刷新列表。 */
  const handleDelete = async (tag: KnowledgeTagDto) => {
    if (!window.confirm(`确定删除标签“${tag.name}”吗？`)) return;

    setSubmitting(true);
    setError(null);
    try {
      await deleteTag(tag.id);
      await loadTags();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除标签失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex flex-col gap-3 border-b border-zinc-100 pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
          <p className="mt-1 text-sm text-zinc-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((value) => !value)}
          className="w-fit rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          {showCreateForm ? "收起表单" : "新建标签"}
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          className="h-9 w-full rounded-md border border-zinc-300 px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-blue-500 md:max-w-xs"
          placeholder="搜索标签名称"
        />
        <button
          type="button"
          onClick={() => void loadTags()}
          className="w-fit rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
        >
          刷新
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {showCreateForm && (
        <div className="mt-4">
          <TagForm
            key="create-tag"
            submitting={submitting}
            submitLabel="创建标签"
            onCancel={() => setShowCreateForm(false)}
            onSubmit={handleCreate}
          />
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
            <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
            加载标签中...
          </div>
        ) : tags.length === 0 ? (
          <div className="py-12 text-center text-sm text-zinc-400">
            {trimmedKeyword ? "没有匹配的标签" : "暂无标签"}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase text-zinc-500">
                <th className="px-4 py-3">标签</th>
                <th className="px-4 py-3">排序</th>
                <th className="px-4 py-3">更新时间</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {tags.map((tag) => (
                <tr key={tag.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full border border-zinc-200"
                        style={{ backgroundColor: tag.color ?? "#d4d4d8" }}
                      />
                      <span className="font-medium text-zinc-900">
                        {tag.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{tag.sortOrder}</td>
                  <td className="px-4 py-3 text-zinc-500">
                    {formatDate(tag.updatedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => void handleDelete(tag)}
                        className="rounded px-2 py-1 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/** 将 ISO 时间格式化为中文本地时间。 */
function formatDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
