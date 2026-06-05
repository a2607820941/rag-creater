interface ParseProgress {
  stage: string;
  percent: number;
}

const store = new Map<string, ParseProgress>();

export function setProgress(id: string, stage: string, percent: number) {
  store.set(id, { stage, percent });
}

export function getProgress(id: string): ParseProgress | undefined {
  return store.get(id);
}

export function getProgresses(ids: string[]): Record<string, ParseProgress | undefined> {
  const result: Record<string, ParseProgress | undefined> = {};
  for (const id of ids) {
    result[id] = store.get(id);
  }
  return result;
}

export function clearProgress(id: string) {
  store.delete(id);
}
