import type {
  ExamDetail,
  GradedSubmission,
  HelpRequestInput,
  LoginResult,
  OverallReflectionInput,
  ReflectionItem,
  ResultSummary,
  StudentExamState,
} from '../domain/types';

export interface ApiClient {
  login(name: string, pin: string): Promise<LoginResult>;
  getExam(sessionToken: string, examId: string): Promise<ExamDetail>;
  getStudentExamState(sessionToken: string, examId: string): Promise<StudentExamState>;
  submitAnswers(
    sessionToken: string,
    examId: string,
    clientRequestId: string,
    answers: Array<{ questionNo: number; answer: number | null }>,
  ): Promise<GradedSubmission>;
  submitReflection(
    sessionToken: string,
    submissionId: string,
    items: ReflectionItem[],
    overall: OverallReflectionInput,
    helpRequests: HelpRequestInput[],
  ): Promise<ResultSummary>;
  getResult(sessionToken: string, submissionId: string): Promise<ResultSummary>;
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

