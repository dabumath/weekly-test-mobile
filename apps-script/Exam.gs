function normalizedExamStatus_(value) {
  var status = String(value || '').trim().toUpperCase();
  if (status === '공개') return 'OPEN';
  if (status === '마감') return 'CLOSED';
  if (status === '준비중') return 'DRAFT';
  return status;
}

function dateMillisOrNull_(value) {
  if (!value) return null;
  var date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function examRecord_(examId) {
  var rows = readRows_('exams').filter(function (row) { return String(row.exam_id) === String(examId); });
  if (rows.length !== 1) throw apiError_('EXAM_NOT_FOUND', '시험 정보를 불러오지 못했습니다.');
  return rows[0];
}

function examTargetsClass_(exam, className) {
  return String(exam['대상 반'] || '').split(',').map(function (value) { return value.trim(); }).indexOf(String(className).trim()) >= 0;
}

function examIsOpenNow_(exam) {
  var now = Date.now();
  if (normalizedExamStatus_(exam['상태']) !== 'OPEN') return false;
  var opensAt = dateMillisOrNull_(exam['공개 시작']);
  var closesAt = dateMillisOrNull_(exam['제출 마감']);
  return (!opensAt || opensAt <= now) && (!closesAt || now <= closesAt);
}

function reflectionIsOpenNow_(exam) {
  if (normalizedExamStatus_(exam['상태']) !== 'OPEN') return false;
  var closesAt = dateMillisOrNull_(exam['복기 마감']);
  return !closesAt || Date.now() <= closesAt;
}

function assertExamForStudent_(examId, student, requireOpen) {
  var exam = examRecord_(examId);
  if (!examTargetsClass_(exam, student['정규반'])) throw apiError_('EXAM_NOT_FOUND', '시험 정보를 불러오지 못했습니다.');
  if (requireOpen && !examIsOpenNow_(exam)) throw apiError_('EXAM_NOT_OPEN', '현재 제출할 수 있는 시험이 아닙니다.');
  return exam;
}

function questionRecords_(exam) {
  var rows = readRows_('questions').filter(function (row) { return String(row.exam_id) === String(exam.exam_id); });
  return rows.map(function (row) {
    return {
      questionNo: Number(row['문항']),
      questionType: String(row['문항 유형'] || 'MCQ'),
      correctAnswer: Number(row['정답']),
      points: Number(row['배점'])
    };
  }).sort(function (a, b) { return a.questionNo - b.questionNo; });
}

function examSummary_(exam) {
  return {
    examId: String(exam.exam_id),
    title: String(exam['시험명']),
    subject: String(exam['과목']),
    questionCount: Number(exam['문항 수']),
    totalScore: Number(exam['총점'])
  };
}

function examDetail_(exam) {
  var questions = questionRecords_(exam);
  if (questions.length !== Number(exam['문항 수'])) {
    throw apiError_('SERVER_NOT_CONFIGURED', '시험 문항 수 설정이 일치하지 않습니다.');
  }
  gradeAnswersCore(questions, questions.map(function (question) {
    return { questionNo: question.questionNo, answer: null };
  }), Number(exam['선택지 수']), Number(exam['총점']));
  var summary = examSummary_(exam);
  return {
    examId: summary.examId,
    title: summary.title,
    subject: summary.subject,
    questionCount: summary.questionCount,
    totalScore: summary.totalScore,
    choiceCount: Number(exam['선택지 수']),
    questions: questions.map(function (question) {
      return { questionNo: question.questionNo, questionType: question.questionType, points: question.points };
    })
  };
}

function getExamAction_(payload) {
  var session = requireSession_(payload.sessionToken);
  var student = getStudentById_(session.studentId);
  var exam = assertExamForStudent_(payload.examId, student, false);
  return examDetail_(exam);
}

function activeExamsForStudent_(student) {
  return readRows_('exams').filter(function (exam) {
    return examTargetsClass_(exam, student['정규반']) && examIsOpenNow_(exam);
  }).map(examSummary_);
}
