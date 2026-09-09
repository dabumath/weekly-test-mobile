import type { GradedQuestion, ReflectionItem, ReviewCategory } from './types';

const ALL_CATEGORIES: ReviewCategory[] = [
  'SOLVED_CORRECT',
  'LUCKY_CORRECT',
  'UNKNOWN_WRONG',
  'MISTAKE_WRONG',
  'TIME_SHORTAGE_WRONG',
];

export function calculateReflectionScore(
  questions: GradedQuestion[],
  reflections: ReflectionItem[],
) {
  const byNo = new Map(reflections.map((item) => [item.questionNo, item]));
  const rawScore = questions.reduce((sum, q) => sum + (q.isCorrect ? q.points : 0), 0);
  const luckyDeduction = questions.reduce(
    (sum, q) => sum + (byNo.get(q.questionNo)?.category === 'LUCKY_CORRECT' ? q.points : 0),
    0,
  );
  const mistakeRecovery = questions.reduce(
    (sum, q) => sum + (byNo.get(q.questionNo)?.category === 'MISTAKE_WRONG' ? q.points : 0),
    0,
  );
  const counts = Object.fromEntries(ALL_CATEGORIES.map((key) => [key, 0])) as Record<
    ReviewCategory,
    number
  >;
  for (const item of reflections) counts[item.category] += 1;
  return {
    rawScore,
    luckyDeduction,
    mistakeRecovery,
    adjustedScore: rawScore - luckyDeduction + mistakeRecovery,
    counts,
  };
}

