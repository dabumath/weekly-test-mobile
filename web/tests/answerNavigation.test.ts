import { describe, expect, it } from 'vitest';
import { getAnswerSelectionDestination } from '../src/answerNavigation';

describe('answer selection navigation', () => {
  it('moves to the answer review when every question has an answer', () => {
    expect(getAnswerSelectionDestination([1, 2, 3], { 1: 2, 2: 4, 3: 1 }, 2)).toBe('review');
  });

  it('moves to the next unanswered question while answers remain', () => {
    expect(getAnswerSelectionDestination([1, 2, 3], { 1: 2, 2: 4 }, 0)).toBe(2);
  });

  it('stays put when only an earlier question is unanswered', () => {
    expect(getAnswerSelectionDestination([1, 2, 3], { 2: 4, 3: 1 }, 2)).toBeNull();
  });
});
