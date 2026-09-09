const KEY = 'weekly-test-session-v1';

export interface BrowserDraft {
  sessionToken?: string;
  displayName?: string;
  className?: string;
  examId?: string;
  answers?: Record<number, number | null>;
  reflections?: Record<number, { category: string; mistakeReason?: string | null }>;
  help?: Record<number, { helpTypes: string[]; note?: string }>;
  overall?: { strengths: string[]; regrets: string[]; nextAction: string; freeNote?: string };
  lastActivityAt?: number;
}

export function readDraft(): BrowserDraft {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || '{}') as BrowserDraft;
  } catch {
    return {};
  }
}

export function patchDraft(update: Partial<BrowserDraft>) {
  const current = readDraft();
  sessionStorage.setItem(KEY, JSON.stringify({ ...current, ...update, lastActivityAt: Date.now() }));
}

export function clearDraft() {
  sessionStorage.removeItem(KEY);
}

export function clearAnswerDraft() {
  const current = readDraft();
  delete current.answers;
  sessionStorage.setItem(KEY, JSON.stringify({ ...current, lastActivityAt: Date.now() }));
}
