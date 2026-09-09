export type QuestionType = 'MCQ' | 'SHORT_ANSWER';
export type ReviewCategory =
  | 'SOLVED_CORRECT'
  | 'LUCKY_CORRECT'
  | 'UNKNOWN_WRONG'
  | 'MISTAKE_WRONG'
  | 'TIME_SHORTAGE_WRONG';

export type MistakeReason =
  | 'CALCULATION'
  | 'SIGN'
  | 'CONDITION_MISSED'
  | 'MISREAD'
  | 'ANSWER_TRANSCRIPTION'
  | 'FORMULA_CONFUSION'
  | 'NO_REVIEW'
  | 'OTHER';

export type HelpType =
  | 'CONCEPT_EXPLANATION'
  | 'TYPE_EXPLANATION'
  | 'SIMILAR_PROBLEM'
  | 'OTHER';

export interface ExamSummary {
  examId: string;
  title: string;
  subject: string;
  questionCount: number;
  totalScore: number;
}

export interface ExamQuestion {
  questionNo: number;
  questionType: QuestionType;
  points: number;
}

export interface ExamDetail extends ExamSummary {
  choiceCount: number;
  questions: ExamQuestion[];
}

export interface GradedQuestion extends ExamQuestion {
  studentAnswer: number | null;
  correctAnswer: number;
  isCorrect: boolean;
  earnedPoints: number;
}

export interface GradedSubmission {
  submissionId: string;
  examId: string;
  rawScore: number;
  totalScore: number;
  submittedAt: string;
  questions: GradedQuestion[];
}

export interface ReflectionItem {
  questionNo: number;
  category: ReviewCategory;
  mistakeReason?: MistakeReason | null;
}

export interface HelpRequestInput {
  questionNo: number;
  helpTypes: HelpType[];
  note?: string;
}

export interface OverallReflectionInput {
  strengths: string[];
  regrets: string[];
  nextAction: string;
  freeNote?: string;
}

export interface SavedReflection {
  items: ReflectionItem[];
  overall: OverallReflectionInput;
  helpRequests: HelpRequestInput[];
}

export interface ResultSummary extends GradedSubmission {
  luckyDeduction: number;
  mistakeRecovery: number;
  adjustedScore: number;
  counts: Record<ReviewCategory, number>;
  helpRequestCount: number;
  rawAverage: number | null;
  rawAverageCount: number;
  adjustedAverage: number | null;
  adjustedAverageCount: number;
  averageLabel: '현재 제출자 평균' | '반 평균';
}

export type StudentExamState =
  | { state: 'NOT_STARTED'; exam: ExamDetail }
  | { state: 'ANSWER_SUBMITTED'; exam: ExamDetail; submission: GradedSubmission }
  | {
      state: 'REFLECTION_COMPLETED';
      exam: ExamDetail;
      submission: GradedSubmission;
      result: ResultSummary;
      savedReflection: SavedReflection;
      canEditReflection: boolean;
    };

export interface LoginResult {
  sessionToken: string;
  student: { displayName: string; className: string };
  activeExams: ExamSummary[];
}
