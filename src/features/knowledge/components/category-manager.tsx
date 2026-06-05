"use client";

/**
 * 分类管理组件，封装分类查询、创建、编辑和删除的完整交互。
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createCategory,
  deleteCategory,
  fetchCategories,
  updateCategory,
} from "@/features/knowledge/api/categories";
import { CategoryForm } from "@/features/knowledge/components/category-form";
import type {
  KnowledgeCategoryDto,
  KnowledgeCategoryFormValues,
} from "@/features/knowledge/types";

/** 分类管理组件参数。 */
type CategoryManagerProps = {
  title?: string;
  description?: string;
};

/** 提供分类列表、创建、编辑和删除能力的可嵌入管理组件。 */
export function CategoryManager({
  title = "分类管理",
  description = "维护知识分类，后续可接入知识列表筛选。",
}: CategoryManagerProps) {
  const [categories, setCategories] = useState<KnowledgeCategoryDto[]>([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<KnowledgeCategoryDto | null>(null);

  const trimmedKeyword = useMemo(() => keyword.trim(), [keyword]);

  /** 按当前关键词从 API 刷新分类列表。 */
  const loadCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCategories({ keyword: trimmedKeyword });
      setCategories(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "加载分类失败"
      );
    } finally {
      setLoading(false);
    }
  }, [trimmedKeyword]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard data fetching on mount/filter change
    void loadCategories();
  }, [loadCategories]);

  /** 创建分类并刷新列表。 */
  const handleCreate = async (values: KnowledgeCategoryFormValues) => {
    setSubmitting(true);
    setError(null);
    try {
      await createCategory(values);
      setShowCreateForm(false);
      await loadCategories();
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "创建分类失败"
      );
    } finally {
      setSubmitting(false);
    }
  };

  /** 更新当前编辑中的分类并刷新列表。 */
  const handleUpdate = async (values: KnowledgeCategoryFormValues) => {
    if (!editingCategory) return;

    setSubmitting(true);
    setError(null);
    try {
      await updateCategory(editingCategory.id, values);
      setEditingCategory(null);
      await loadCategories();
    } catch (updateError) {
      setError(
        updateError instanceof Error ? updateError.message : "更新分类失败"
      );
    } finally {
      setSubmitting(false);
    }
  };

  /** 二次确认后删除指定分类并刷新列表。 */
  const handleDelete = async (category: KnowledgeCategoryDto) => {
    if (!window.confirm(`确定删除分类“${category.name}”吗？`)) return;

    setSubmitting(true);
    setError(null);
    try {
      await deleteCategory(category.id);
      if (editingCategory?.id === category.id) setEditingCategory(null);
      await loadCategories();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "删除分类失败"
      );
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
          onClick={() => {
            setEditingCategory(null);
            setShowCreateForm((value) => !value);
          }}
          className="w-fit rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          {showCreateForm ? "收起表单" : "新建分类"}
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          className="h-9 w-full rounded-md border border-zinc-300 px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-blue-500 md:max-w-xs"
          placeholder="搜索分类名称或描述"
        />
        <button
          type="button"
          onClick={() => void loadCategories()}
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
          <CategoryForm
            key="create-category"
            submitting={submitting}
            submitLabel="创建分类"
            onCancel={() => setShowCreateForm(false)}
            onSubmit={handleCreate}
          />
        </div>
      )}

      {editingCategory && (
        <div className="mt-4">
          <CategoryForm
            key={editingCategory.id}
            initialValue={editingCategory}
            submitting={submitting}
            submitLabel="保存修改"
            onCancel={() => setEditingCategory(null)}
            onSubmit={handleUpdate}
          />
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
            <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
            加载分类中...
          </div>
        ) : categories.length === 0 ? (
          <div className="py-12 text-center text-sm text-zinc-400">
            {trimmedKeyword ? "没有匹配的分类" : "暂无分类"}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase text-zinc-500">
                <th className="px-4 py-3">分类</th>
                <th className="px-4 py-3">描述</th>
                <th className="px-4 py-3">排序</th>
                <th className="px-4 py-3">更新时间</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {categories.map((category) => (
                <tr key={category.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full border border-zinc-200"
                        style={{
                          backgroundColor: category.color ?? "#d4d4d8",
                        }}
                      />
                      <span className="font-medium text-zinc-900">
                        {category.name}
                      </span>
                    </div>
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-zinc-500">
                    {category.description || "-"}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {category.sortOrder}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {formatDate(category.updatedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateForm(false);
                          setEditingCategory(category);
                        }}
                        className="rounded px-2 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => void handleDelete(category)}
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
