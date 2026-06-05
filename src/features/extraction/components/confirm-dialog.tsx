"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface KnowledgeBaseItem {
  id: string;
  name: string;
  description?: string;
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateCount: number;
  knowledgeBases: KnowledgeBaseItem[];
  loading: boolean;
  onConfirm: (kbIds: string[]) => void;
}

export default function ConfirmDialog({
  open,
  onOpenChange,
  candidateCount,
  knowledgeBases,
  loading,
  onConfirm,
}: Props) {
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setSelectedKbIds([]);
      setDropdownOpen(false);
    }
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleKb = (id: string) => {
    setSelectedKbIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleConfirm = () => {
    if (selectedKbIds.length === 0) return;
    onConfirm(selectedKbIds);
    onOpenChange(false);
  };

  const selectedKbs = knowledgeBases.filter((kb) =>
    selectedKbIds.includes(kb.id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>确认入库到知识库</DialogTitle>
          <DialogDescription>
            已选择 {candidateCount} 条候选知识，请选择目标知识库
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* 知识库多选下拉 */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm border rounded-lg bg-white hover:bg-gray-50 transition-colors ${
                selectedKbIds.length === 0
                  ? "border-amber-300 text-gray-400"
                  : "border-gray-300 text-gray-700"
              }`}
            >
              <span>
                {selectedKbIds.length === 0
                  ? "请选择目标知识库..."
                  : `已选 ${selectedKbIds.length} 个知识库`}
              </span>
              <svg
                className={`h-4 w-4 ml-2 transition-transform ${
                  dropdownOpen ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {dropdownOpen && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {knowledgeBases.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-400">
                    暂无可用知识库，请先创建
                  </div>
                ) : (
                  knowledgeBases.map((kb) => (
                    <label
                      key={kb.id}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedKbIds.includes(kb.id)}
                        onChange={() => toggleKb(kb.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      />
                      <span className="text-gray-700">{kb.name}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 已选知识库标签 */}
          {selectedKbs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedKbs.map((kb) => (
                <span
                  key={kb.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200"
                >
                  {kb.name}
                  <button
                    type="button"
                    onClick={() => toggleKb(kb.id)}
                    className="ml-0.5 hover:text-blue-900"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedKbIds.length === 0 || loading}
          >
            {loading ? "入库中..." : `确认入库 (${candidateCount})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
