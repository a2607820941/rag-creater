/**
 * 搜索高亮组件，用于展示知识标题、摘要或正文中的关键词命中片段。
 */

export type SearchHighlightProps = {
  text: string;
  keyword?: string;
  className?: string;
  highlightClassName?: string;
  maxLength?: number;
  emptyText?: string;
};

/** 渲染带关键词高亮的文本片段。 */
export function SearchHighlight({
  text,
  keyword,
  className,
  highlightClassName = "rounded bg-yellow-100 px-0.5 font-medium text-yellow-900",
  maxLength,
  emptyText = "-",
}: SearchHighlightProps) {
  const displayText = truncateText(text, maxLength);
  const keywords = splitKeyword(keyword);

  if (!displayText) {
    return <span className={className}>{emptyText}</span>;
  }

  if (keywords.length === 0) {
    return <span className={className}>{displayText}</span>;
  }

  const regex = new RegExp(`(${keywords.map(escapeRegExp).join("|")})`, "gi");
  const parts = displayText.split(regex);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (!part) return null;

        const matched = keywords.some(
          (item) => item.toLowerCase() === part.toLowerCase()
        );

        if (!matched) {
          return <span key={`${part}-${index}`}>{part}</span>;
        }

        return (
          <mark key={`${part}-${index}`} className={highlightClassName}>
            {part}
          </mark>
        );
      })}
    </span>
  );
}

/** 将搜索关键词按空白字符切分并去重。 */
function splitKeyword(keyword?: string): string[] {
  if (!keyword) return [];

  return Array.from(
    new Set(keyword.split(/\s+/).map((item) => item.trim()).filter(Boolean))
  );
}

/** 转义正则特殊字符，避免用户输入影响匹配表达式。 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 按最大长度截断文本，超出时追加省略号。 */
function truncateText(text: string, maxLength?: number): string {
  if (maxLength === undefined || maxLength <= 0) return text;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}
