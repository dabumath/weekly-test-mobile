import { describe, expect, it } from 'vitest';
import { MockApiClient } from '../src/api/mockApi';

describe('final-submit-only student flow', () => {
  it('grades answers, finalizes reflection, restores it, and allows an upsert edit', async () => {
    const client = new MockApiClient();
    const login = await client.login('테스트 학생', '1234');
    const examId = login.activeExams[0].examId;
    const exam = await client.getExam(login.sessionToken, examId);
    expect((await client.getStudentExamState(login.sessionToken, examId)).state).toBe('NOT_STARTED');

    const submission = await client.submitAnswers(
      login.sessionToken,
      examId,
      'request_flow_0001',
      exam.questions.map((question) => ({ questionNo: question.questionNo, answer: 1 })),
    );
    expect(submission.questions).toHaveLength(25);
    expect((await client.getStudentExamState(login.sessionToken, examId)).state).toBe('ANSWER_SUBMITTED');

    const items = submission.questions.map((question) => ({
      questionNo: question.questionNo,
      category: question.isCorrect ? ('SOLVED_CORRECT' as const) : ('UNKNOWN_WRONG' as const),
    }));
    const overall = {
      strengths: ['끝까지 집중했다'],
      regrets: ['검산하지 못했다'],
      nextAction: '',
      freeNote: '',
    };
    const result = await client.submitReflection(
      login.sessionToken,
      submission.submissionId,
      items,
      overall,
      [{ questionNo: 1, helpTypes: ['CONCEPT_EXPLANATION'] }],
    );
    expect(result.helpRequestCount).toBe(1);

    const restored = await client.getStudentExamState(login.sessionToken, examId);
    expect(restored.state).toBe('REFLECTION_COMPLETED');
    if (restored.state !== 'REFLECTION_COMPLETED') throw new Error('reflection was not restored');
    expect(restored.savedReflection.items).toHaveLength(25);
    expect(restored.canEditReflection).toBe(true);

    const updated = await client.submitReflection(
      login.sessionToken,
      submission.submissionId,
      items,
      { ...overall, nextAction: '검산 순서를 미리 정한다.' },
      [],
    );
    expect(updated.helpRequestCount).toBe(0);
  });
});
