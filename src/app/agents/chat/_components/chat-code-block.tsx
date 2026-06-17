"use client";

import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChatCodeBlockProps = {
  children: ReactNode;
  className?: string;
  code: string;
  language?: string;
};

export function ChatCodeBlock({
  children,
  className,
  code,
  language,
}: ChatCodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const languageLabel = language || "text";

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="my-3 overflow-hidden rounded-md border border-slate-200 bg-slate-950 text-slate-100">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/5 px-3 py-2">
        <span className="min-w-0 truncate text-xs font-medium text-slate-300">
          {languageLabel}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={copyCode}
          className="h-6 text-slate-200 hover:bg-white/10 hover:text-white"
        >
          {copied ? (
            <Check data-icon="inline-start" />
          ) : (
            <Copy data-icon="inline-start" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="m-0 overflow-x-auto p-3 text-xs leading-6">
        <code
          className={cn(
            "block min-w-max bg-transparent! p-0! text-inherit",
            className,
            language ? `language-${language}` : undefined
          )}
        >
          {children}
        </code>
      </pre>
    </div>
  );
}
