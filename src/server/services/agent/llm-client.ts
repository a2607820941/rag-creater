import type { ChatRole } from "@/features/chat/chat.types";
import type { LlmInterfaceKey } from "@/features/chat/chat.validation";

export type LlmMessage = {
  role: ChatRole;
  content: string | LlmContentPart[];
};

export type LlmContentPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image_url";
      image_url: {
        url: string;
      };
    };

type ChatCompletionChunk = {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
};

type LlmConfig = {
  apiKey?: string;
  baseUrl: string;
  model?: string;
};

function getLlmConfig(llmInterface: LlmInterfaceKey = "default") {
  const config = getRawLlmConfig(llmInterface);
  const modelLabel = getModelEnvLabel(llmInterface);
  const keyLabel = getApiKeyEnvLabel(llmInterface);

  if (!config.apiKey && llmInterface !== "local") {
    throw new Error(`${keyLabel} 未配置`);
  }
  if (!config.model) {
    throw new Error(`${modelLabel} 未配置`);
  }

  return {
    ...config,
    baseUrl: config.baseUrl.replace(/\/$/, ""),
  };
}

function getRawLlmConfig(llmInterface: LlmInterfaceKey): LlmConfig {
  if (llmInterface === "openai") {
    return {
      apiKey: process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY,
      model: process.env.OPENAI_MODEL ?? process.env.LLM_MODEL,
      baseUrl:
        process.env.OPENAI_BASE_URL ??
        process.env.LLM_BASE_URL ??
        "https://api.openai.com/v1",
    };
  }

  if (llmInterface === "local") {
    return {
      apiKey: process.env.LOCAL_LLM_API_KEY,
      model: process.env.LOCAL_LLM_MODEL,
      baseUrl: process.env.LOCAL_LLM_BASE_URL ?? "http://localhost:11434/v1",
    };
  }

  return {
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL,
    baseUrl: process.env.LLM_BASE_URL ?? "https://api.openai.com/v1",
  };
}

function getApiKeyEnvLabel(llmInterface: LlmInterfaceKey): string {
  if (llmInterface === "openai") return "OPENAI_API_KEY 或 LLM_API_KEY";
  if (llmInterface === "local") return "LOCAL_LLM_API_KEY";
  return "LLM_API_KEY";
}

function getModelEnvLabel(llmInterface: LlmInterfaceKey): string {
  if (llmInterface === "openai") return "OPENAI_MODEL 或 LLM_MODEL";
  if (llmInterface === "local") return "LOCAL_LLM_MODEL";
  return "LLM_MODEL";
}

export async function createChatCompletion(
  messages: LlmMessage[],
  llmInterface: LlmInterfaceKey = "default",
  options?: { signal?: AbortSignal }
): Promise<string> {
  const config = getLlmConfig(llmInterface);
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    signal: options?.signal,
    headers: {
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.2,
      stream: false,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`LLM 调用失败：${res.status} ${errorText}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return json.choices?.[0]?.message?.content ?? "";
}

export async function streamChatCompletion(
  messages: LlmMessage[],
  onToken: (token: string) => void,
  llmInterface: LlmInterfaceKey = "default",
  options?: { signal?: AbortSignal }
): Promise<string> {
  const config = getLlmConfig(llmInterface);
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    signal: options?.signal,
    headers: {
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.2,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    const errorText = await res.text();
    throw new Error(`LLM 流式调用失败：${res.status} ${errorText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") {
        return fullText;
      }

      try {
        const chunk = JSON.parse(data) as ChatCompletionChunk;
        const token = chunk.choices?.[0]?.delta?.content ?? "";
        if (token) {
          fullText += token;
          onToken(token);
        }
      } catch {
        // Compatible gateways may emit non-JSON keepalive frames.
      }
    }
  }

  return fullText;
}
