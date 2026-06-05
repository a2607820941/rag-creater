import { prisma } from "@/lib/db";
import type { ExpertAgent, Prisma } from "@/generated/prisma/client";

import {
  parseAgentKnowledgeScope,
  stringifyAgentKnowledgeScope,
  type AgentCreateInput,
  type AgentListQuery,
  type AgentUpdateInput,
} from "@/features/agent/agent.validation";
import { buildAgentSystemPrompt } from "@/features/agent/agent-prompt";
import type { AgentKnowledgeScope } from "@/features/agent/agent.types";

export { buildAgentSystemPrompt };

export type AgentDTO = Omit<ExpertAgent, "knowledgeScope"> & {
  knowledgeScope: ReturnType<typeof parseAgentKnowledgeScope>;
};

export type AgentValidationResult = {
  valid: boolean;
  reasons: string[];
  warnings: string[];
  checks: {
    agentExists: boolean;
    agentStatus: string | null;
    hasKnowledgeBaseScope: boolean;
    enabledKnowledgeBaseCount: number;
    availableChunkCount: number;
    uncheckedScopeFields: string[];
  };
  ragScope: {
    knowledgeBaseIds: string[];
    knowledgeIds?: string[];
    categoryIds?: string[];
    tagIds?: string[];
    chunkTypes?: string[];
  } | null;
};

export async function createAgent(input: AgentCreateInput): Promise<AgentDTO> {
  const knowledgeScope = toKnowledgeBaseOnlyScope(input.knowledgeScope);
  const agent = await prisma.expertAgent.create({
    data: {
      name: input.name,
      description: input.description,
      answerStyle: input.answerStyle,
      knowledgeScope: stringifyAgentKnowledgeScope(knowledgeScope),
      showReferences: input.showReferences,
      allowKnowledgeCapture: input.allowKnowledgeCapture,
      status: input.status,
      systemPrompt: input.systemPrompt,
    },
  });

  return toAgentDTO(agent);
}

export async function listAgents(options: AgentListQuery) {
  const { page, pageSize, status, keyword } = options;

  const where: Prisma.ExpertAgentWhereInput = {};
  if (status) {
    where.status = status;
  }
  if (keyword) {
    where.OR = [
      { name: { contains: keyword } },
      { description: { contains: keyword } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.expertAgent.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.expertAgent.count({ where }),
  ]);

  return {
    items: items.map(toAgentDTO),
    total,
    page,
    pageSize,
  };
}

export async function getAgentById(id: string): Promise<AgentDTO | null> {
  const agent = await prisma.expertAgent.findUnique({ where: { id } });
  return agent ? toAgentDTO(agent) : null;
}

export async function updateAgent(
  id: string,
  input: AgentUpdateInput
): Promise<AgentDTO | null> {
  const current = await prisma.expertAgent.findUnique({ where: { id } });
  if (!current) return null;

  const data: Prisma.ExpertAgentUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.answerStyle !== undefined) data.answerStyle = input.answerStyle;
  if (input.knowledgeScope !== undefined) {
    data.knowledgeScope = stringifyAgentKnowledgeScope(
      toKnowledgeBaseOnlyScope(input.knowledgeScope)
    );
  }
  if (input.showReferences !== undefined) {
    data.showReferences = input.showReferences;
  }
  if (input.allowKnowledgeCapture !== undefined) {
    data.allowKnowledgeCapture = input.allowKnowledgeCapture;
  }
  if (input.status !== undefined) data.status = input.status;
  if (input.systemPrompt !== undefined) data.systemPrompt = input.systemPrompt;

  const agent = await prisma.expertAgent.update({
    where: { id },
    data,
  });

  return toAgentDTO(agent);
}

export async function deleteAgent(id: string): Promise<AgentDTO | null> {
  const current = await prisma.expertAgent.findUnique({ where: { id } });
  if (!current) return null;

  const agent = await prisma.expertAgent.delete({ where: { id } });
  return toAgentDTO(agent);
}

export async function validateAgentAvailability(
  id: string
): Promise<AgentValidationResult | null> {
  const agent = await getAgentById(id);
  if (!agent) return null;

  const reasons: string[] = [];
  const warnings: string[] = [];
  const scope = toKnowledgeBaseOnlyScope(agent.knowledgeScope);
  const activeStatuses = ["active", "available"];
  const uncheckedScopeFields: string[] = [];
  const hasKnowledgeBaseScope = scope.knowledgeBaseIds.length > 0;

  if (agent.status === "disabled") {
    reasons.push("Agent 当前已禁用，不能用于问答。");
  }

  if (!hasKnowledgeBaseScope) {
    reasons.push("Agent 尚未绑定知识库，无法构造检索范围。");
  }

  const enabledKnowledgeBaseCount = hasKnowledgeBaseScope
    ? await prisma.knowledgeBase.count({
        where: {
          id: { in: scope.knowledgeBaseIds },
          status: { in: activeStatuses },
        },
      })
    : 0;

  if (hasKnowledgeBaseScope && enabledKnowledgeBaseCount === 0) {
    reasons.push("Agent 绑定的知识库不存在或未启用。");
  }

  const availableChunkCount =
    enabledKnowledgeBaseCount > 0
      ? await countAvailableKnowledgeChunks(scope, activeStatuses)
      : 0;

  if (enabledKnowledgeBaseCount > 0 && availableChunkCount === 0) {
    warnings.push(
      "当前范围内暂未发现可用知识片段。知识入库或 RAG 检索模块完成后，需要再次检查。"
    );
  }

  if (uncheckedScopeFields.length > 0) {
    warnings.push(
      `当前 schema 尚未完整支持 ${uncheckedScopeFields.join(
        "、"
      )} 的数据库级校验，已保留配置供后续检索模块使用。`
    );
  }

  return {
    valid: reasons.length === 0,
    reasons,
    warnings,
    checks: {
      agentExists: true,
      agentStatus: agent.status,
      hasKnowledgeBaseScope,
      enabledKnowledgeBaseCount,
      availableChunkCount,
      uncheckedScopeFields,
    },
    ragScope: hasKnowledgeBaseScope
      ? {
          knowledgeBaseIds: scope.knowledgeBaseIds,
          knowledgeIds:
            scope.knowledgeIds.length > 0 ? scope.knowledgeIds : undefined,
          categoryIds:
            scope.categoryIds.length > 0 ? scope.categoryIds : undefined,
          tagIds: scope.tagIds.length > 0 ? scope.tagIds : undefined,
          chunkTypes:
            scope.chunkTypes.length > 0 ? scope.chunkTypes : undefined,
        }
      : null,
  };
}

export async function generateAgentSystemPrompt(
  id: string
): Promise<AgentDTO | null> {
  const current = await getAgentById(id);
  if (!current) return null;

  const systemPrompt = buildAgentSystemPrompt({
    name: current.name,
    description: current.description,
    answerStyle: current.answerStyle,
    knowledgeScope: toKnowledgeBaseOnlyScope(current.knowledgeScope),
    showReferences: current.showReferences,
    allowKnowledgeCapture: current.allowKnowledgeCapture,
  });
  const agent = await prisma.expertAgent.update({
    where: { id },
    data: { systemPrompt },
  });

  return toAgentDTO(agent);
}

function toAgentDTO(agent: ExpertAgent): AgentDTO {
  return {
    ...agent,
    knowledgeScope: parseAgentKnowledgeScope(agent.knowledgeScope),
  };
}

function toKnowledgeBaseOnlyScope(
  scope: AgentKnowledgeScope
): AgentKnowledgeScope {
  return {
    ...scope,
    mode: "knowledgeBases",
    categoryIds: [],
    tagIds: [],
    knowledgeIds: [],
    chunkTypes: [],
  };
}

async function countAvailableKnowledgeChunks(
  scope: AgentKnowledgeScope,
  activeStatuses: string[]
): Promise<number> {
  const where: Prisma.DocumentChunkWhereInput = {
    chunkStatus: { in: activeStatuses },
    documentSource: {
      knowledgeBases: {
        some: { knowledgeBaseId: { in: scope.knowledgeBaseIds } },
      },
    },
  };

  return prisma.documentChunk.count({ where });
}
