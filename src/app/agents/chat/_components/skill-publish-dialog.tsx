"use client";

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

  return (
    <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {published ? "Skill published" : "Publish this Skill?"}
          </DialogTitle>
          <DialogDescription>
            {published
              ? "The Skill package has been generated in the project skills directory."
              : "The draft is saved. Publish it to generate SKILL.md, manifest, references, and a one-time API key."}
          </DialogDescription>
        </DialogHeader>

        {draft && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
            <div className="font-medium text-slate-950">{draft.name}</div>
            <div className="mt-1 break-all text-xs text-slate-500">
              {draft.slug}
            </div>
            <div className="mt-3 grid gap-1 text-xs">
              <span>Status: {published ? published.skill.status : draft.status}</span>
              <span>Path: {skillPath}</span>
              {published && <span>Endpoint: {published.endpoint}</span>}
            </div>
          </div>
        )}

        {published && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-900">
            <div className="font-medium">One-time API key</div>
            <div className="mt-1 break-all font-mono">{published.apiKey}</div>
            <div className="mt-1 text-amber-800">
              The server stores only the key hash. This plaintext key is shown once.
            </div>
          </div>
        )}

        {published && draft && (
          <div className="rounded-md border border-slate-200 bg-white p-3 text-xs leading-6 text-slate-700">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium text-slate-950">Agent install package</div>
              <Button asChild type="button" variant="outline" size="sm">
                <a href={packageDownloadUrl} download>
                  <Download data-icon="inline-start" />
                  Download
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
                <div className="font-medium text-slate-800">Runtime key</div>
                <div className="mt-1 grid gap-1 break-all font-mono text-[11px] leading-5 text-slate-600">
                  <span>node scripts/set-runtime-key.mjs &quot;{published.apiKey}&quot;</span>
                  <span>export SKILL_API_KEY=&quot;{published.apiKey}&quot;</span>
                </div>
                <div className="mt-1 text-[11px] leading-5 text-slate-500">
                  Use set-runtime-key for desktop or already-running agents. export only works for the current terminal process.
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {published ? "Close" : "Not now"}
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
              Publish
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
