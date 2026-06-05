"use client";

import { useState } from "react";

interface Candidate {
  id: string;
  title: string;
  content: string;
  suggested_category: string | null;
  suggested_tags: string[];
  type: string;
}

interface Props {
  candidate: Candidate;
  onSave: (candidate: Candidate) => void;
  onCancel: () => void;
}

export default function CandidateEditor({
  candidate,
  onSave,
  onCancel,
}: Props) {
  const [title, setTitle] = useState(candidate.title);
  const [content, setContent] = useState(candidate.content);
  const [category, setCategory] = useState(
    candidate.suggested_category || ""
  );
  const [tags, setTags] = useState(
    candidate.suggested_tags.join(", ")
  );
  const [type, setType] = useState(candidate.type);

  const handleSave = () => {
    if (!title.trim() || !content.trim()) return;
    onSave({
      ...candidate,
      title: title.trim(),
      content: content.trim(),
      suggested_category: category.trim() || null,
      suggested_tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      type,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            编辑候选知识
          </h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              标题
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              内容
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                分类
              </label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="如：前端开发"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                知识类型
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="concept">概念</option>
                <option value="faq">问答</option>
                <option value="procedure">步骤</option>
                <option value="note">注意</option>
                <option value="summary">总结</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              标签（逗号分隔）
            </label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="如：React, Hooks, JavaScript"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              保存修改
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
