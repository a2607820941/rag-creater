"use client";

export type KnowledgeBaseDetailFilterValue = {
  chunkType: "all" | "text" | "knowledge";
  reviewStatus: "all" | "confirmed" | "pending" | "rejected";
  suggestedCategory: "all" | string;
  suggestedTag: "all" | string;
};

type KnowledgeBaseDetailFilterBarProps = {
  value: KnowledgeBaseDetailFilterValue;
  categories: string[];
  tags: string[];
  disabled?: boolean;
  onChange: (value: KnowledgeBaseDetailFilterValue) => void;
  onReset?: () => void;
};

const DEFAULT_FILTER: KnowledgeBaseDetailFilterValue = {
  chunkType: "all",
  reviewStatus: "all",
  suggestedCategory: "all",
  suggestedTag: "all",
};

export function getDefaultKnowledgeBaseDetailFilter() {
  return DEFAULT_FILTER;
}

export function isDefaultKnowledgeBaseDetailFilter(
  value: KnowledgeBaseDetailFilterValue
) {
  return (
    value.chunkType === DEFAULT_FILTER.chunkType &&
    value.reviewStatus === DEFAULT_FILTER.reviewStatus &&
    value.suggestedCategory === DEFAULT_FILTER.suggestedCategory &&
    value.suggestedTag === DEFAULT_FILTER.suggestedTag
  );
}

export function KnowledgeBaseDetailFilterBar({
  value,
  categories,
  tags,
  disabled = false,
  onChange,
  onReset,
}: KnowledgeBaseDetailFilterBarProps) {
  const hasActiveFilter = !isDefaultKnowledgeBaseDetailFilter(value);

  const updateFilter = (
    key: keyof KnowledgeBaseDetailFilterValue,
    nextValue: string
  ) => {
    onChange({
      ...value,
      [key]: nextValue,
    });
  };

  const resetFilter = () => {
    if (disabled) return;
    onChange(DEFAULT_FILTER);
    onReset?.();
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(130px,1fr)_minmax(130px,1fr)_minmax(150px,1.2fr)_minmax(150px,1.2fr)_auto] xl:items-end">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">
            内容类型
          </span>
          <select
            value={value.chunkType}
            disabled={disabled}
            onChange={(event) => updateFilter("chunkType", event.target.value)}
            className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none transition-colors focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
          >
            <option value="all">全部内容</option>
            <option value="text">原文文本</option>
            <option value="knowledge">AI 知识</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">
            审核状态
          </span>
          <select
            value={value.reviewStatus}
            disabled={disabled}
            onChange={(event) =>
              updateFilter("reviewStatus", event.target.value)
            }
            className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none transition-colors focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
          >
            <option value="all">全部状态</option>
            <option value="confirmed">已确认</option>
            <option value="pending">待审核</option>
            <option value="rejected">已驳回</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">
            分类
          </span>
          <select
            value={value.suggestedCategory}
            disabled={disabled || categories.length === 0}
            onChange={(event) =>
              updateFilter("suggestedCategory", event.target.value)
            }
            className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none transition-colors focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
          >
            <option value="all">
              {categories.length === 0 ? "暂无分类" : "全部分类"}
            </option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">
            标签
          </span>
          <select
            value={value.suggestedTag}
            disabled={disabled || tags.length === 0}
            onChange={(event) =>
              updateFilter("suggestedTag", event.target.value)
            }
            className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none transition-colors focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
          >
            <option value="all">
              {tags.length === 0 ? "暂无标签" : "全部标签"}
            </option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          disabled={disabled || !hasActiveFilter}
          onClick={resetFilter}
          className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          重置筛选
        </button>
      </div>
    </div>
  );
}
