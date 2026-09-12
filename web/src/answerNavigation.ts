export function getAnswerSelectionDestination(
  questionNumbers: number[],
  answers: Record<number, number | null>,
  currentIndex: number,
): number | 'review' | null {
  if (questionNumbers.every((questionNo) => answers[questionNo] != null)) return 'review';

  const nextUnansweredIndex = questionNumbers.findIndex(
    (questionNo, index) => index > currentIndex && answers[questionNo] == null,
  );
  return nextUnansweredIndex >= 0 ? nextUnansweredIndex : null;
}
