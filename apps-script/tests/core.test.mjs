import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../Core.gs', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context, { filename: 'Core.gs' });

test('name normalization trims and collapses whitespace', () => {
  assert.equal(context.normalizeNameCore('  김   학생  '), '김 학생');
});

test('server grading accepts unanswered questions and uses configured points', () => {
  const graded = context.gradeAnswersCore(
    [
      { questionNo: 1, questionType: 'MCQ', correctAnswer: 2, points: 3 },
      { questionNo: 2, questionType: 'MCQ', correctAnswer: 4, points: 7 },
    ],
    [
      { questionNo: 1, answer: 2 },
      { questionNo: 2, answer: null },
    ],
    5,
    10,
  );
  assert.equal(graded.rawScore, 3);
  assert.equal(graded.questions[0].isCorrect, true);
  assert.equal(graded.questions[1].isCorrect, false);
});

test('server grading rejects incomplete payloads and wrong point totals', () => {
  assert.throws(
    () => context.gradeAnswersCore(
      [{ questionNo: 1, correctAnswer: 1, points: 10 }],
      [],
      5,
      10,
    ),
    /모든 문항/,
  );
  assert.throws(
    () => context.gradeAnswersCore(
      [{ questionNo: 1, correctAnswer: 1, points: 9 }],
      [{ questionNo: 1, answer: 1 }],
      5,
      10,
    ),
    /총점/,
  );
});

test('reflection categories must match correctness', () => {
  const questions = [
    { questionNo: 1, isCorrect: true, points: 4 },
    { questionNo: 2, isCorrect: false, points: 6 },
  ];
  assert.throws(
    () => context.validateReflectionCore(questions, [
      { questionNo: 1, category: 'UNKNOWN_WRONG' },
      { questionNo: 2, category: 'MISTAKE_WRONG' },
    ]),
    /1번/,
  );
});

test('adjusted score subtracts lucky points and restores mistake points', () => {
  const score = context.computeReflectionScoreCore(
    [
      { questionNo: 1, isCorrect: true, points: 4 },
      { questionNo: 2, isCorrect: false, points: 6 },
    ],
    [
      { questionNo: 1, category: 'LUCKY_CORRECT' },
      { questionNo: 2, category: 'MISTAKE_WRONG', mistakeReason: 'CALCULATION' },
    ],
  );
  assert.equal(score.rawScore, 4);
  assert.equal(score.luckyDeduction, 4);
  assert.equal(score.mistakeRecovery, 6);
  assert.equal(score.adjustedScore, 6);
});

test('help requests deduplicate types and reject duplicate questions', () => {
  const cleaned = context.validateHelpRequestsCore(
    [{ questionNo: 2, helpTypes: ['OTHER', 'OTHER'], note: ' 질문 ' }],
    [1, 2],
  );
  assert.deepEqual(JSON.parse(JSON.stringify(cleaned)), [
    { questionNo: 2, helpTypes: ['OTHER'], note: '질문' },
  ]);
  assert.throws(
    () => context.validateHelpRequestsCore([
      { questionNo: 2, helpTypes: ['OTHER'] },
      { questionNo: 2, helpTypes: ['OTHER'] },
    ], [1, 2]),
    /문항/,
  );
});
