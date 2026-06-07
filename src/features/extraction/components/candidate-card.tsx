"use client";

interface Candidate {
  id: string;
  title: string;
  content: string;
  suggested_category: string | null;
  suggested_tags: string[];
  type: string;
  sourceType?: string | null;
  documentTitle?: string | null;
}

interface Props {
  candidate: Candidate;
  selected: boolean;
  highlighted?: boolean;
  onToggle: (id: string) => void;
  onEdit: (candidate: Candidate) => void;
  onDelete: (id: string) => void;
}

const typeLabels: Record<string, string> = {
  faq: "问答",
  concept: "概念",
  procedure: "步骤",
  note: "注意",
  summary: "总结",
};

const typeColors: Record<string, string> = {
  faq: "bg-purple-100 text-purple-700",
  concept: "bg-blue-100 text-blue-700",
  procedure: "bg-green-100 text-green-700",
  note: "bg-yellow-100 text-yellow-700",
  summary: "bg-gray-100 text-gray-700",
};

const sourceLabels: Record<string, string> = {
  conversation: "对话沉淀",
  file: "文档提炼",
  manual: "手动录入",
  text: "文本录入",
  url: "链接导入",
  markdown: "Markdown",
  image: "图片解析",
};

export default function CandidateCard({
  candidate,
  selected,
  highlighted = false,
  onToggle,
  onEdit,
  onDelete,
}: Props) {
  return (
    <div
      id={`candidate-${candidate.id}`}
      className={`border rounded-lg p-4 transition-all ${
        selected
          ? "border-blue-400 bg-blue-50 ring-2 ring-blue-200"
          : highlighted
            ? "border-amber-300 bg-amber-50 ring-2 ring-amber-200"
          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(candidate.id)}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span
              className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                typeColors[candidate.type] ||
                "bg-gray-100 text-gray-600"
              }`}
            >
              {typeLabels[candidate.type] || candidate.type}
            </span>
            {candidate.sourceType && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                {sourceLabels[candidate.sourceType] || candidate.sourceType}
              </span>
            )}
            {candidate.suggested_category && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                {candidate.suggested_category}
              </span>
            )}
          </div>
          <h3 className="font-medium text-gray-900 mb-1">
            {candidate.title}
          </h3>
          {candidate.documentTitle && (
            <p className="text-xs text-gray-500 mb-1.5">
              {candidate.documentTitle}
            </p>
          )}
          <p className="text-sm text-gray-600 line-clamp-3">
            {candidate.content}
          </p>
          {candidate.suggested_tags.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {candidate.suggested_tags.map((tag: string) => (
                <span
                  key={tag}
                  className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(candidate);
            }}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
          >
            编辑
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(candidate.id);
            }}
            className="text-sm text-red-500 hover:text-red-700 font-medium whitespace-nowrap"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}
