"use client";

import Image from "next/image";
import {
  memo,
  useMemo,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, {
  defaultSchema,
  type Options as SanitizeSchema,
} from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";

import { cn } from "@/lib/utils";

import { useThrottledMarkdown } from "../_hooks/use-throttled-markdown";
import {
  normalizeInlineReferenceClusters,
  remarkChatReferences,
  repairStreamingMarkdown,
  splitStreamingMarkdown,
  splitStreamingMarkdownTail,
} from "../_lib/markdown";
import { ChatCodeBlock } from "./chat-code-block";

type ChatMarkdownProps = {
  content: string;
  onReferenceClick?: (refId: string) => void;
  streaming?: boolean;
};

type TextNode = {
  value?: string;
  children?: TextNode[];
};

const REF_PATTERN = /\[(ref[_-]?\d+)\]/gi;

const sanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ["className", /^language-./, "hljs"],
    ],
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      ["className", /^hljs-./],
    ],
    sup: [
      ...(defaultSchema.attributes?.sup ?? []),
      ["className", "chat-ref"],
    ],
    input: [
      ...(defaultSchema.attributes?.input ?? []),
      ["type", "checkbox"],
      ["checked"],
      ["disabled"],
    ],
  },
  clobberPrefix: "chat-md-",
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "del",
    "input",
    "sup",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
  ],
};

function createMarkdownComponents(
  onReferenceClick?: (refId: string) => void
): Components {
  return {
  a({ children, href, ...props }) {
    const anchorProps = omitMarkdownNode(props);

    return (
      <a
        {...anchorProps}
        href={href}
        target={href?.startsWith("#") ? undefined : "_blank"}
        rel={href?.startsWith("#") ? undefined : "noreferrer noopener"}
        className="font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
      >
        {children}
      </a>
    );
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-3 border-l-2 border-emerald-600/70 bg-emerald-50/60 py-2 pl-3 pr-2 text-slate-700">
        {children}
      </blockquote>
    );
  },
  code({ children, className, node, ...props }) {
    const code = getNodeText(node).replace(/\n$/, "");
    const language = className?.match(/language-([\w-]+)/)?.[1];
    const isBlock = Boolean(language || code.includes("\n"));

    if (!isBlock) {
      return (
        <code
          {...props}
          className={cn(
            "rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.92em] text-slate-800",
            className
          )}
        >
          {children}
        </code>
      );
    }

    return (
      <ChatCodeBlock code={code} className={className} language={language}>
        {children}
      </ChatCodeBlock>
    );
  },
  h1({ children }) {
    return <h2 className="mb-2 mt-4 text-lg font-semibold">{children}</h2>;
  },
  h2({ children }) {
    return <h3 className="mb-2 mt-4 text-base font-semibold">{children}</h3>;
  },
  h3({ children }) {
    return <h4 className="mb-2 mt-3 text-sm font-semibold">{children}</h4>;
  },
  h4({ children }) {
    return <h4 className="mb-2 mt-3 text-sm font-semibold">{children}</h4>;
  },
  hr() {
    return <div className="my-4 border-t border-slate-200" />;
  },
  img({ alt, src, title }) {
    if (!src || typeof src !== "string") return null;

    return (
      <Image
        src={src}
        alt={alt || title || "Markdown image"}
        width={720}
        height={420}
        className="my-3 h-auto max-w-full rounded-md border border-slate-200 object-contain"
        unoptimized
      />
    );
  },
  li({ children, className, ...props }) {
    const itemProps = omitMarkdownNode(props);

    return (
      <li {...itemProps} className={cn("my-1 pl-1", className)}>
        {children}
      </li>
    );
  },
  ol({ children }) {
    return <ol className="my-3 list-decimal pl-5">{children}</ol>;
  },
  p({ children }) {
    return <p className="my-2 first:mt-0 last:mb-0">{children}</p>;
  },
  pre({ children }) {
    return <>{children}</>;
  },
  sup({ children }) {
    const refId = getChildrenText(children).replace(/^\[|\]$/g, "");

    if (!refId || !/^ref[_-]?\d+$/i.test(refId)) {
      return <sup className="chat-ref">{children}</sup>;
    }

    return (
      <sup className="chat-ref">
        <button
          type="button"
          onClick={() => onReferenceClick?.(refId)}
          className="rounded-sm px-0.5 text-inherit underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/30"
          title={`Open reference ${refId}`}
        >
          [{refId}]
        </button>
      </sup>
    );
  },
  table({ children }) {
    return (
      <div className="my-3 max-w-full overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full min-w-max border-collapse text-left text-xs">
          {children}
        </table>
      </div>
    );
  },
  tbody({ children }) {
    return <tbody className="divide-y divide-slate-100">{children}</tbody>;
  },
  td({ children, ...props }: ComponentPropsWithoutRef<"td"> & { node?: unknown }) {
    const cellProps = omitMarkdownNode(props);

    return (
      <td {...cellProps} className="border-slate-100 px-3 py-2 align-top">
        {children}
      </td>
    );
  },
  th({ children, ...props }: ComponentPropsWithoutRef<"th"> & { node?: unknown }) {
    const headerProps = omitMarkdownNode(props);

    return (
      <th
        {...headerProps}
        className="border-b border-slate-200 bg-slate-50 px-3 py-2 align-top font-semibold"
      >
        {children}
      </th>
    );
  },
  thead({ children }) {
    return <thead>{children}</thead>;
  },
  tr({ children }) {
    return <tr className="border-b border-slate-100 last:border-b-0">{children}</tr>;
  },
  ul({ children }) {
    return <ul className="my-3 list-disc pl-5">{children}</ul>;
  },
  };
}

function getNodeText(node: unknown): string {
  if (!node || typeof node !== "object") return "";

  const textNode = node as TextNode;

  if (typeof textNode.value === "string") return textNode.value;
  if (!textNode.children) return "";

  return textNode.children.map(getNodeText).join("");
}

function omitMarkdownNode<T extends { node?: unknown }>(props: T) {
  const { node, ...rest } = props;
  void node;
  return rest;
}

function getChildrenText(children: unknown): string {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }

  if (Array.isArray(children)) return children.map(getChildrenText).join("");

  return "";
}

function safeUrlTransform(url: string, key: string) {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return undefined;
  if (trimmedUrl.startsWith("//")) return undefined;

  if (trimmedUrl.startsWith("#") || trimmedUrl.startsWith("/")) {
    return trimmedUrl;
  }

  try {
    const parsed = new URL(trimmedUrl, "https://local.invalid");
    const protocol = parsed.protocol.toLowerCase();

    if (key === "href" && ["http:", "https:", "mailto:"].includes(protocol)) {
      return trimmedUrl;
    }

    if (key === "src" && ["http:", "https:"].includes(protocol)) {
      return trimmedUrl;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function ChatMarkdownComponent({
  content,
  onReferenceClick,
  streaming = false,
}: ChatMarkdownProps) {
  const throttledContent = useThrottledMarkdown(content, streaming);
  const normalizedContent = normalizeInlineReferenceClusters(throttledContent);
  const streamingParts = streaming
    ? splitStreamingMarkdown(normalizedContent)
    : { stable: normalizedContent, active: "" };
  const markdown = streaming
    ? repairStreamingMarkdown(streamingParts.stable)
    : streamingParts.stable;
  const components = useMemo(
    () => createMarkdownComponents(onReferenceClick),
    [onReferenceClick]
  );
  const rehypePlugins = useMemo<PluggableList>(
    () =>
      streaming
        ? [[rehypeSanitize, sanitizeSchema]]
        : [rehypeHighlight, [rehypeSanitize, sanitizeSchema]],
    [streaming]
  );

  if (!markdown && !streamingParts.active) return null;

  return (
    <div className="chat-markdown min-w-0 break-words text-sm leading-7 text-inherit">
      {markdown && (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkChatReferences]}
          rehypePlugins={rehypePlugins}
          components={components}
          skipHtml
          urlTransform={safeUrlTransform}
        >
          {markdown}
        </ReactMarkdown>
      )}
      {streamingParts.active && (
        <StreamingMarkdownTail
          content={streamingParts.active}
          onReferenceClick={onReferenceClick}
        />
      )}
    </div>
  );
}

export const ChatMarkdown = memo(ChatMarkdownComponent);

function StreamingMarkdownTail({
  content,
  onReferenceClick,
}: {
  content: string;
  onReferenceClick?: (refId: string) => void;
}) {
  const { settled, active } = splitStreamingMarkdownTail(content);

  return (
    <span className="whitespace-pre-wrap break-words">
      {settled && (
        <span className="text-slate-800">
          {renderStreamingTailContent(settled, onReferenceClick)}
        </span>
      )}
      {active && (
        <span>{renderStreamingTailContent(active, onReferenceClick)}</span>
      )}
    </span>
  );
}

function renderStreamingTailContent(
  content: string,
  onReferenceClick?: (refId: string) => void
) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(REF_PATTERN)) {
    const fullMatch = match[0];
    const refId = match[1];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      nodes.push(content.slice(lastIndex, index));
    }

    nodes.push(
      <sup key={`${refId}-${index}`} className="chat-ref">
        <button
          type="button"
          onClick={() => onReferenceClick?.(refId)}
          className="rounded-sm px-0.5 text-inherit underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/30"
          title={`Open reference ${refId}`}
        >
          [{refId}]
        </button>
      </sup>
    );

    lastIndex = index + fullMatch.length;
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : content;
}
