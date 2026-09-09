import { describe, expect, it } from 'vitest';
import { calculateReflectionScore } from '../src/domain/scoring';
import { validateReflectionCompletion } from '../src/domain/validation';
import type { GradedQuestion, ReflectionItem } from '../src/domain/types';

const questions: GradedQuestion[] = [
  { questionNo: 1, questionType: 'MCQ', studentAnswer: 2, correctAnswer: 2, isCorrect: true, points: 3.5, earnedPoints: 3.5 },
  { questionNo: 2, questionType: 'MCQ', studentAnswer: 1, correctAnswer: 3, isCorrect: false, points: 4, earnedPoints: 0 },
  { questionNo: 3, questionType: 'MCQ', studentAnswer: null, correctAnswer: 5, isCorrect: false, points: 5, earnedPoints: 0 },
];

describe('reflection scoring', () => {
  it('subtracts lucky answers and recovers mistake points', () => {
    const items: ReflectionItem[] = [
      { questionNo: 1, category: 'LUCKY_CORRECT' },
      { questionNo: 2, category: 'MISTAKE_WRONG', mistakeReason: 'CALCULATION' },
      { questionNo: 3, category: 'UNKNOWN_WRONG' },
    ];
    expect(calculateReflectionScore(questions, items)).toMatchObject({
      rawScore: 3.5,
      luckyDeduction: 3.5,
      mistakeRecovery: 4,
      adjustedScore: 4,
    });
    expect(validateReflectionCompletion(questions, items)).toBeNull();
  });

  it('rejects a correct category on a wrong answer', () => {
    const items: ReflectionItem[] = [
      { questionNo: 1, category: 'SOLVED_CORRECT' },
      { questionNo: 2, category: 'SOLVED_CORRECT' },
      { questionNo: 3, category: 'TIME_SHORTAGE_WRONG' },
    ];
    expect(validateReflectionCompletion(questions, items)).toContain('2번');
  });

  it('requires every wrong answer reflection', () => {
    expect(validateReflectionCompletion(questions, [{ questionNo: 1, category: 'SOLVED_CORRECT' }])).toContain('2번');
  });
});

