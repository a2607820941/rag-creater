export function formatConversationMode(mode: string) {
  if (mode === "knowledge-agent") return "Knowledge Agent";
  if (mode === "openai" || mode === "rag-openai") return "LLM";
  if (mode === "skill-agent") return "Skill Agent";
  if (mode === "agent") return "Agent";
  return mode;
}

export function formatConversationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  if (sameDay) {
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
