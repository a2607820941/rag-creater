export function buildKnowledgeAgentSelectorPrompt(input: {
  question: string;
  documents: string;
}) {
  return [
    "You are selecting documents for a knowledge-agent answer.",
    "Choose at most 3 document ids that are most useful for the user's request.",
    "Prefer the smallest set of documents that can answer well.",
    "Return strict JSON only.",
    'Format: {"documentIds":["id1","id2"],"reason":"short explanation"}',
    "If none of the documents look relevant, return an empty array for documentIds.",
    "",
    `Question:\n${input.question}`,
    "",
    `Candidate documents:\n${input.documents}`,
  ].join("\n");
}

export function buildKnowledgeAgentAnswerPrompt(input: {
  question: string;
  documents: string;
  attachmentContext?: string | null;
}) {
  return [
    "You are Knowledge Agent, a read-only analyst for a knowledge-base management platform.",
    "Answer the user's question using the selected documents when possible.",
    "If the evidence is partial, say so clearly instead of filling gaps with certainty.",
    "Prefer concise synthesis over long quotation.",
    "Do not invent document details, metrics, or conclusions.",
    input.attachmentContext
      ? `Attachment context:\n${input.attachmentContext}`
      : "Attachment context:\nNo attachments in this turn.",
    `Selected documents:\n${input.documents}`,
  ].join("\n\n");
}
