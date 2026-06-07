import type { ChatCitation } from "@/features/chat/chat.types";
import type { CandidateKnowledgeItem } from "@/features/extraction/extraction.validation";
import { deduplicateCandidates, extractKnowledge } from "@/lib/ai-extract";
import { prisma } from "@/lib/db";

const CAPTURE_SOURCE_TYPE = "conversation";
const CAPTURE_TEXT_MAX_LENGTH = 12000;
const MIN_CAPTURE_TEXT_LENGTH = 80;

const HIGH_VALUE_PATTERNS = [
  /正确做法/,
  /标准(?:流程|口径|答案|规范|操作|方案)/,
  /(?:业务|产品|系统|权限|审核|入库|检索)规则/,
  /排障(?:步骤|流程|方法|指南)/,
  /故障(?:处理|排查|定位|恢复)/,
  /操作步骤/,
  /注意事项/,
  /适用(?:场景|条件|范围)/,
  /例外(?:情况|规则|处理)/,
  /以后(?:都)?按(?:这个|这套|这种)/,
  /用户(?:确认|明确|纠正|补充)/,
  /(?:确认|补充|纠正)(?:一下|一个|一条|为)/,
  /(?:不是|不应该是)[\s\S]{0,80}(?:而是|应该是)/,
  /最佳实践/,
  /知识库(?:规则|口径|标准)/,
  /候选知识/,
  /审核(?:规则|流程|标准)/,
  /FAQ/i,
  /SOP/i,
];

const LOW_VALUE_PATTERNS = [
  /^(你好|您好|hi|hello|在吗|谢谢|感谢|ok|好的|收到)[。！!.\s]*$/i,
  /^(测试|test|随便问问|没事了)[。！!.\s]*$/i,
  /(?:临时|先这样|暂时|这次先|可能|大概|猜测|不确定)/,
];

export type ConversationCaptureInput = {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  agentId?: string;
  userMessage: string;
  assistantMessage: string;
  citations?: ChatCitation[];
};

export type ConversationCaptureResult =
  | { status: "skipped"; reason: string }
  | { status: "captured"; documentSourceId: string; candidateCount: number };

export async function maybeCaptureFromConversation(
  input: ConversationCaptureInput
): Promise<ConversationCaptureResult> {
  if (!input.agentId) {
    return { status: "skipped", reason: "missing_agent" };
  }

  const agent = await prisma.expertAgent.findUnique({
    where: { id: input.agentId },
    select: {
      id: true,
      name: true,
      allowKnowledgeCapture: true,
    },
  });

  if (!agent || !agent.allowKnowledgeCapture) {
    return { status: "skipped", reason: "capture_disabled" };
  }

  if (!shouldCapture(buildConversationCaptureSignalText(input))) {
    return { status: "skipped", reason: "low_value" };
  }

  const sourceText = buildConversationCaptureText(input, agent.name);
  const extracted = await extractKnowledge(sourceText);
  if (!extracted.success || !extracted.candidates?.length) {
    return { status: "skipped", reason: "extract_empty" };
  }

  const candidates = await filterDuplicateCandidates(
    deduplicateCandidates(extracted.candidates)
  );
  if (candidates.length === 0) {
    return { status: "skipped", reason: "duplicate" };
  }

  const documentSource = await prisma.documentSource.create({
    data: {
      originalName: `Conversation capture ${input.conversationId}`,
      title: `Conversation capture / ${agent.name}`,
      fileType: "text",
      fileName: null,
      fileUrl: null,
      mimeType: "text/plain",
      fileSize: sourceText.length,
      sourceType: CAPTURE_SOURCE_TYPE,
      rawContent: sourceText,
      chunkSize: 800,
      chunkOverlap: 100,
      status: "parsed",
      activeStatus: "disabled",
      chunkCount: candidates.length,
    },
  });

  await prisma.documentChunk.createMany({
    data: candidates.map((candidate, index) =>
      toConversationCandidateChunk(candidate, documentSource.id, index)
    ),
  });

  return {
    status: "captured",
    documentSourceId: documentSource.id,
    candidateCount: candidates.length,
  };
}

function shouldCapture(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length < MIN_CAPTURE_TEXT_LENGTH) return false;
  if (LOW_VALUE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }
  return HIGH_VALUE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function buildConversationCaptureSignalText(input: ConversationCaptureInput) {
  return [
    input.userMessage,
    input.assistantMessage,
    ...(input.citations ?? []).map(
      (citation) => `${citation.title}\n${citation.content}`
    ),
  ]
    .join("\n")
    .slice(0, CAPTURE_TEXT_MAX_LENGTH);
}

function buildConversationCaptureText(
  input: ConversationCaptureInput,
  agentName: string
): string {
  const citationsText =
    input.citations && input.citations.length > 0
      ? input.citations
          .slice(0, 5)
          .map(
            (citation) =>
              `- [${citation.refId}] ${citation.title}: ${citation.content.slice(
                0,
                500
              )}`
          )
          .join("\n")
      : "None";

  return [
    "Extract reusable knowledge candidates from this chat conversation.",
    "Only keep stable facts, verified procedures, business rules, FAQ answers, troubleshooting steps, or user-confirmed corrections.",
    "Do not create candidates from casual chat, uncertain guesses, temporary decisions, or content that is only useful for this one conversation.",
    "",
    `Agent: ${agentName}`,
    `Conversation ID: ${input.conversationId}`,
    `User message ID: ${input.userMessageId}`,
    `Assistant message ID: ${input.assistantMessageId}`,
    "",
    "User message:",
    input.userMessage,
    "",
    "Assistant answer:",
    input.assistantMessage,
    "",
    "Citations:",
    citationsText,
  ]
    .join("\n")
    .slice(0, CAPTURE_TEXT_MAX_LENGTH);
}

async function filterDuplicateCandidates(
  candidates: CandidateKnowledgeItem[]
): Promise<CandidateKnowledgeItem[]> {
  if (candidates.length === 0) return [];

  const titles = candidates.map((candidate) => candidate.title.trim());
  const existing = await prisma.documentChunk.findMany({
    where: {
      chunkType: "knowledge",
      OR: [
        { title: { in: titles } },
        ...candidates.map((candidate) => ({
          content: { contains: candidate.content.slice(0, 120) },
        })),
      ],
    },
    select: {
      title: true,
      content: true,
    },
    take: 50,
  });

  return candidates.filter((candidate) => {
    const title = candidate.title.trim().toLowerCase();
    const contentStart = candidate.content.trim().slice(0, 120);

    return !existing.some((item) => {
      const sameTitle = item.title?.trim().toLowerCase() === title;
      const sameContent =
        contentStart.length > 30 && item.content.includes(contentStart);
      return sameTitle || sameContent;
    });
  });
}

function toConversationCandidateChunk(
  candidate: CandidateKnowledgeItem,
  documentSourceId: string,
  index: number
) {
  const tagsJson = JSON.stringify(candidate.suggestedTags || []);

  return {
    documentSourceId,
    content: candidate.content,
    title: candidate.title,
    chunkType: "knowledge",
    knowledgeType: candidate.type,
    suggestedCategory: candidate.suggestedCategory || null,
    suggestedTags: tagsJson === "[]" ? null : tagsJson,
    reviewStatus: "pending",
    chunkStatus: "disabled",
    chunkIndex: index,
    charStart: 0,
    charEnd: candidate.content.length,
  };
}
