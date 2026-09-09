import type { GradedQuestion, ReflectionItem } from './types';

export function validateReflectionCompletion(
  questions: GradedQuestion[],
  items: ReflectionItem[],
): string | null {
  const byNo = new Map(items.map((item) => [item.questionNo, item]));
  for (const question of questions) {
    const item = byNo.get(question.questionNo);
    if (!item) return `${question.questionNo}번 문항의 복기를 완료해주세요.`;
    if (question.isCorrect && !['SOLVED_CORRECT', 'LUCKY_CORRECT'].includes(item.category)) {
      return `${question.questionNo}번 문항의 복기 선택을 확인해주세요.`;
    }
    if (!question.isCorrect && !['UNKNOWN_WRONG', 'MISTAKE_WRONG', 'TIME_SHORTAGE_WRONG'].includes(item.category)) {
      return `${question.questionNo}번 문항의 오답 원인을 선택해주세요.`;
    }
    if (item.category !== 'MISTAKE_WRONG' && item.mistakeReason) {
      return `${question.questionNo}번 문항의 실수 원인을 확인해주세요.`;
    }
  }
  return null;
}

