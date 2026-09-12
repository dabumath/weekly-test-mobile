import type { ApiClient } from './apiClient';
import { ApiError } from './apiClient';
import { calculateReflectionScore } from '../domain/scoring';
import { validateReflectionCompletion } from '../domain/validation';
import type {
  ExamDetail,
  GradedSubmission,
  HelpRequestInput,
  LoginResult,
  OverallReflectionInput,
  ReflectionItem,
  ResultSummary,
  SavedReflection,
  StudentExamState,
} from '../domain/types';

const answers = [3, 2, 4, 4, 5, 3, 3, 2, 3, 5, 1, 3, 2, 1, 5, 1, 1, 2, 2, 5, 5, 1, 3, 4, 4];
const points = [3.5,3.5,3.5,3.5,3.5,3.5,3.5,3.5,3.5,3.5,4,4,4,4,4,4,4,4,4.5,4.5,4.5,4.5,5,5,5];

const exam: ExamDetail = {
  examId: 'weekly-2026-08-commonmath2',
  title: '주간고사 공통수학2 8회',
  subject: '공통수학2',
  questionCount: 25,
  choiceCount: 5,
  totalScore: 100,
  questions: points.map((value, index) => ({
    questionNo: index + 1,
    questionType: 'MCQ',
    points: value,
  })),
};

let submission: GradedSubmission | null = null;
let finalResult: ResultSummary | null = null;
let savedReflection: SavedReflection | null = null;

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MockApiClient implements ApiClient {
  async login(name: string, pin: string): Promise<LoginResult> {
    if (!name.trim() || pin !== '1234') throw new ApiError('AUTH_FAILED', '입력한 학생 정보를 확인해주세요.');
    return {
      sessionToken: 'mock-session-token',
      student: { displayName: name.trim(), className: 'B' },
      activeExams: [{
        examId: exam.examId,
        title: exam.title,
        subject: exam.subject,
        questionCount: exam.questionCount,
        totalScore: exam.totalScore,
      }],
    };
  }

  async getExam(_sessionToken: string, examId: string) {
    if (examId !== exam.examId) throw new ApiError('EXAM_NOT_FOUND', '시험 정보를 불러오지 못했습니다.');
    return clone(exam);
  }

  async getStudentExamState(_sessionToken: string, examId: string): Promise<StudentExamState> {
    if (examId !== exam.examId) throw new ApiError('EXAM_NOT_FOUND', '시험 정보를 불러오지 못했습니다.');
    if (finalResult && savedReflection && submission) return {
      state: 'REFLECTION_COMPLETED',
      exam: clone(exam),
      submission: clone(submission),
      result: clone(finalResult),
      savedReflection: clone(savedReflection),
      canEditReflection: true,
    };
    if (submission) return { state: 'ANSWER_SUBMITTED', exam: clone(exam), submission: clone(submission) };
    return { state: 'NOT_STARTED', exam: clone(exam) };
  }

  async submitAnswers(
    _sessionToken: string,
    examId: string,
    clientRequestId: string,
    selected: Array<{ questionNo: number; answer: number | null }>,
  ) {
    if (examId !== exam.examId) throw new ApiError('EXAM_NOT_FOUND', '시험 정보를 불러오지 못했습니다.');
    if (submission) {
      if (submission.submissionId === clientRequestId) return clone(submission);
      throw new ApiError('ANSWER_ALREADY_SUBMITTED', '이미 제출된 답안입니다.');
    }
    const byNo = new Map(selected.map((item) => [item.questionNo, item.answer]));
    const questions = exam.questions.map((question, index) => {
      const studentAnswer = byNo.get(question.questionNo) ?? null;
      const isCorrect = studentAnswer === answers[index];
      return {
        ...question,
        studentAnswer,
        correctAnswer: answers[index],
        isCorrect,
        earnedPoints: isCorrect ? question.points : 0,
      };
    });
    submission = {
      submissionId: clientRequestId,
      examId,
      rawScore: questions.reduce((sum, q) => sum + q.earnedPoints, 0),
      totalScore: exam.totalScore,
      submittedAt: new Date().toISOString(),
      questions,
    };
    return clone(submission);
  }

  async submitReflection(
    _sessionToken: string,
    submissionId: string,
    items: ReflectionItem[],
    overall: OverallReflectionInput,
    helpRequests: HelpRequestInput[],
  ) {
    if (!submission || submission.submissionId !== submissionId) throw new ApiError('SUBMISSION_NOT_FOUND', '제출 정보를 불러오지 못했습니다.');
    const issue = validateReflectionCompletion(submission.questions, items);
    if (issue) throw new ApiError('INVALID_INPUT', issue);
    const score = calculateReflectionScore(submission.questions, items);
    finalResult = {
      ...submission,
      ...score,
      helpRequestCount: helpRequests.length,
      rawAverage: null,
      rawAverageCount: 1,
      adjustedAverage: null,
      adjustedAverageCount: 1,
      averageLabel: '현재 제출자 평균',
    };
    savedReflection = { items: clone(items), overall: clone(overall), helpRequests: clone(helpRequests) };
    return clone(finalResult);
  }

  async getResult(_sessionToken: string, submissionId: string) {
    if (!finalResult || finalResult.submissionId !== submissionId) throw new ApiError('SUBMISSION_NOT_FOUND', '결과를 불러오지 못했습니다.');
    return clone(finalResult);
  }
}
