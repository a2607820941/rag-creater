"use client";

import Link from "next/link";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SKILL_STATUS_LABELS } from "@/features/skill/skill-labels";
import type { SkillStatus } from "@/features/skill/skill.types";

import type {
  SkillPublishDraft,
  SkillPublishState,
} from "../_lib/chat-types";

export function SkillPublishDialog({
  draft,
  state,
  onPublish,
  onClose,
}: {
  draft: SkillPublishDraft | null;
  state: SkillPublishState;
  onPublish: () => void;
  onClose: () => void;
}) {
  const published = state.status === "published" ? state : null;
  const skillPath = draft ? `skills/${draft.slug}/SKILL.md` : "";
  const skillDir = draft ? `skills/${draft.slug}` : "";
  const packageDownloadUrl = published
    ? `/api/skills/${published.skill.id}/export-package?format=zip`
    : "";
  const statusLabel = published
    ? getSkillStatusLabel(published.skill.status)
    : draft
      ? getSkillStatusLabel(draft.status)
      : "";

  return (
    <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="grid max-h-[min(720px,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {published ? "Skill 已发布" : "发布这个 Skill？"}
          </DialogTitle>
          <DialogDescription>
            {published
              ? "Skill 包已经生成，可前往 Skill 管理继续测试、下载和安装。"
              : "草稿已保存。发布后会生成 SKILL.md、manifest、references 和一次性 API key。"}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto pr-1">
          <div className="grid gap-3">
            {draft && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                <div className="font-medium text-slate-950">{draft.name}</div>
                <div className="mt-1 break-all text-xs text-slate-500">
                  {draft.slug}
                </div>
                <div className="mt-3 grid gap-1 text-xs">
                  <span>
                    状态：{statusLabel}
                  </span>
                  <span>文件：{skillPath}</span>
                  {published && <span>调用接口：{published.endpoint}</span>}
                </div>
              </div>
            )}

            {published && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-900">
                <div className="font-medium">一次性运行密钥</div>
                <div className="mt-1 break-all font-mono">{published.apiKey}</div>
                <div className="mt-1 text-amber-800">
                  服务端只保存密钥摘要，明文密钥只会展示这一次。
                </div>
              </div>
            )}

            {published && draft && (
              <div className="rounded-md border border-slate-200 bg-white p-3 text-xs leading-6 text-slate-700">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-slate-950">
                    外部 Agent 安装包
                  </div>
                  <Button asChild type="button" variant="outline" size="sm">
                    <a href={packageDownloadUrl} download>
                      <Download data-icon="inline-start" />
                      下载
                    </a>
                  </Button>
                </div>
                <div className="mt-3 grid gap-3">
                  <div>
                    <div className="font-medium text-slate-800">Codex</div>
                    <div className="mt-1 grid gap-1 font-mono text-[11px] leading-5 text-slate-600">
                      <span>cd {skillDir}</span>
                      <span>node scripts/install-skill.mjs codex</span>
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-slate-800">Claude Code</div>
                    <div className="mt-1 grid gap-1 font-mono text-[11px] leading-5 text-slate-600">
                      <span>cd {skillDir}</span>
                      <span>node scripts/install-skill.mjs claude-code</span>
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-slate-800">运行密钥</div>
                    <div className="mt-1 grid gap-1 break-all font-mono text-[11px] leading-5 text-slate-600">
                      <span>
                        node scripts/set-runtime-key.mjs &quot;{published.apiKey}&quot;
                      </span>
                      <span>export SKILL_API_KEY=&quot;{published.apiKey}&quot;</span>
                    </div>
                    <div className="mt-1 text-[11px] leading-5 text-slate-500">
                      桌面端或已经启动的 Agent 建议使用 set-runtime-key 写入配置；export 只对当前终端进程生效。
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          {published && (
            <>
              <Button asChild type="button" variant="outline">
                <Link href="/skills">Skill 管理</Link>
              </Button>
              <Button asChild type="button">
                <Link href={`/skills/${published.skill.id}`}>查看详情</Link>
              </Button>
            </>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            {published ? "关闭" : "暂不发布"}
          </Button>
          {!published && (
            <Button
              type="button"
              onClick={onPublish}
              disabled={state.status === "publishing"}
            >
              {state.status === "publishing" && (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              )}
              发布
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getSkillStatusLabel(status: string) {
  if (isSkillStatus(status)) return SKILL_STATUS_LABELS[status];
  return status;
}

function isSkillStatus(status: string): status is SkillStatus {
  return status === "draft" || status === "published" || status === "disabled";
}
