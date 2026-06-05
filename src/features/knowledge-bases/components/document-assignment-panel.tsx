"use client";

import type * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { RagDoc } from "@/features/knowledge-bases/types";

import { AssignmentDocumentList } from "./assignment-document-list";

type DocumentAssignmentPanelProps = {
  selectedDocuments: RagDoc[];
  availableDocuments: RagDoc[];
  dirty: boolean;
  saving: boolean;
  selectedControls?: React.ReactNode;
  selectedEmptyText?: string;
  onEnable: (documentId: string) => void;
  onRemove: (documentId: string) => void;
  onSave: () => void;
  onViewChunks: (document: RagDoc) => void;
};

export function DocumentAssignmentPanel({
  selectedDocuments,
  availableDocuments,
  dirty,
  saving,
  selectedControls,
  selectedEmptyText = "当前 RAG 暂未引用文档，可以从待选文档中启用。",
  onEnable,
  onRemove,
  onSave,
  onViewChunks,
}: DocumentAssignmentPanelProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>文档归属管理</CardTitle>
          <CardDescription>
            调整当前 RAG 引用哪些知识源，保存后才会写入后端。
          </CardDescription>
        </div>
        <Button type="button" disabled={!dirty || saving} onClick={onSave}>
          {saving ? "保存中..." : "保存文档配置"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {selectedControls}
        <AssignmentDocumentList
          description="当前 RAG 会基于以下文档进行知识增强。"
          documents={selectedDocuments}
          emptyText={selectedEmptyText}
          kind="selected"
          onMove={onRemove}
          onViewChunks={onViewChunks}
          title={`已引用文档（${selectedDocuments.length}）`}
        />
        <AssignmentDocumentList
          description="以下文档尚未被当前 RAG 引用，可以添加为知识来源。"
          documents={availableDocuments}
          emptyText="暂无可选文档。"
          kind="available"
          onMove={onEnable}
          onViewChunks={onViewChunks}
          title={`待选文档（${availableDocuments.length}）`}
        />
      </CardContent>
    </Card>
  );
}
