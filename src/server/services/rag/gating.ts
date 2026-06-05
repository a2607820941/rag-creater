export const RAG_CITATION_MIN_SCORE = 0.75;

const NON_RAG_COMPACT_MESSAGES = new Set([
  "hi",
  "hello",
  "hey",
  "nihao",
  "你好",
  "您好",
  "哈喽",
  "嗨",
  "在吗",
  "早上好",
  "下午好",
  "晚上好",
  "谢谢",
  "多谢",
  "thanks",
  "thankyou",
  "ok",
  "好的",
  "测试",
  "test",
  "你是谁",
  "你能做什么",
]);

export function shouldUseRagForMessage(message: string): boolean {
  const compact = message
    .trim()
    .toLowerCase()
    .replace(/[\s,，.。!！?？:：;；'"“”‘’`~\-_/\\()[\]{}]+/g, "");

  if (!compact) return false;
  if (NON_RAG_COMPACT_MESSAGES.has(compact)) return false;

  const greetingOnlyPattern =
    /^(你好|您好|哈喽|嗨|hi|hello|hey|nihao|在吗|谢谢|thanks|thankyou)+$/;
  if (compact.length <= 16 && greetingOnlyPattern.test(compact)) {
    return false;
  }

  return true;
}
