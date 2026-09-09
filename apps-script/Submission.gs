function gradedQuestionFromRow_(row) {
  var studentAnswer = row.student_answer === '' || row.student_answer === null ? null : Number(row.student_answer);
  return {
    questionNo: Number(row.question_no),
    questionType: 'MCQ',
    points: Number(row.points),
    studentAnswer: studentAnswer,
    correctAnswer: Number(row.correct_answer),
    isCorrect: isTrue_(row.is_correct),
    earnedPoints: Number(row.earned_points)
  };
}

function gradedSubmissionFromRows_(submission, itemRows) {
  return {
    submissionId: String(submission.submission_id),
    examId: String(submission.exam_id),
    rawScore: Number(submission.raw_score),
    totalScore: Number(submission.total_score),
    submittedAt: asIsoString_(submission.submitted_at),
    questions: itemRows.map(gradedQuestionFromRow_)
  };
}

function ensureStoredQuestionRows_(submission, studentId, examId, graded) {
  var existing = submissionItemsFor_(submission.submission_id);
  var byQuestion = {};
  existing.forEach(function (row) {
    var no = Number(row.question_no);
    if (byQuestion[no]) throw apiError_('DATA_CONFLICT', '제출 문항 데이터가 중복되었습니다. 선생님께 문의해주세요.');
    byQuestion[no] = row;
  });
  var now = new Date().toISOString();
  var missing = graded.questions.filter(function (question) { return !byQuestion[question.questionNo]; }).map(function (question) {
    return {
      submission_id: submission.submission_id,
      student_id: studentId,
      exam_id: examId,
      question_no: question.questionNo,
      student_answer: question.studentAnswer,
      correct_answer: question.correctAnswer,
      points: question.points,
      is_correct: question.isCorrect,
      earned_points: question.earnedPoints,
      reflection_category: '',
      mistake_reason: '',
      updated_at: now
    };
  });
  if (missing.length) appendObjects_('submissionItems', missing);
  return submissionItemsFor_(submission.submission_id);
}

function submitAnswersAction_(payload, requestId) {
  var session = requireSession_(payload.sessionToken);
  var student = getStudentById_(session.studentId);
  var exam = assertExamForStudent_(payload.examId, student, true);
  var clientRequestId = requireStringCore(payload.clientRequestId, '답안 제출 식별자', 128);
  if (clientRequestId !== requestId) throw apiError_('INVALID_INPUT', '답안 제출 식별자가 일치하지 않습니다.');
  var questions = questionRecords_(exam);
  var graded;
  try {
    graded = gradeAnswersCore(questions, payload.answers, Number(exam['선택지 수']), Number(exam['총점']));
  } catch (error) {
    throw apiError_('INVALID_INPUT', error.message);
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (error) {
    throw apiError_('SERVER_BUSY', '제출이 몰리고 있습니다. 잠시 후 다시 눌러주세요.');
  }
  try {
    var submissions = readRows_('submissions');
    var byRequest = submissions.filter(function (row) { return String(row.client_request_id) === clientRequestId; });
    if (byRequest.length > 1) throw apiError_('DATA_CONFLICT', '중복 제출 데이터가 있습니다. 선생님께 문의해주세요.');
    if (byRequest.length === 1) {
      var prior = byRequest[0];
      if (String(prior.student_id) !== session.studentId || String(prior.exam_id) !== String(exam.exam_id)) {
        throw apiError_('DATA_CONFLICT', '제출 식별자가 다른 제출과 충돌했습니다.');
      }
      var repairedRows = ensureStoredQuestionRows_(prior, session.studentId, String(exam.exam_id), graded);
      return gradedSubmissionFromRows_(prior, repairedRows);
    }

    var alreadySubmitted = submissions.some(function (row) {
      return String(row.student_id) === session.studentId && String(row.exam_id) === String(exam.exam_id);
    });
    if (alreadySubmitted) throw apiError_('ANSWER_ALREADY_SUBMITTED', '이미 제출된 답안입니다.');

    var now = new Date().toISOString();
    var submissionId = 'sub_' + Utilities.getUuid().replace(/-/g, '');
    appendObjects_('submissions', [{
      submission_id: submissionId,
      client_request_id: clientRequestId,
      student_id: session.studentId,
      exam_id: String(exam.exam_id),
      submitted_at: now,
      raw_score: graded.rawScore,
      total_score: graded.totalScore,
      answer_locked: true,
      reflection_complete: false,
      reflection_completed_at: '',
      created_at: now,
      updated_at: now
    }]);
    appendObjects_('submissionItems', graded.questions.map(function (question) {
      return {
        submission_id: submissionId,
        student_id: session.studentId,
        exam_id: String(exam.exam_id),
        question_no: question.questionNo,
        student_answer: question.studentAnswer,
        correct_answer: question.correctAnswer,
        points: question.points,
        is_correct: question.isCorrect,
        earned_points: question.earnedPoints,
        reflection_category: '',
        mistake_reason: '',
        updated_at: now
      };
    }));
    SpreadsheetApp.flush();
    var storedSubmission = getSubmissionById_(submissionId);
    return gradedSubmissionFromRows_(storedSubmission, submissionItemsFor_(submissionId));
  } finally {
    lock.releaseLock();
  }
}

function savedReflectionFor_(submissionId) {
  var itemRows = submissionItemsFor_(submissionId);
  var overallRows = readRows_('overallReflections').filter(function (row) {
    return String(row.submission_id) === String(submissionId);
  });
  var helpRows = readRows_('helpRequests').filter(function (row) {
    return String(row.submission_id) === String(submissionId) && isTrue_(row.active);
  });
  var overall = overallRows.length ? overallRows[0] : null;
  return {
    items: itemRows.filter(function (row) { return String(row.reflection_category || ''); }).map(function (row) {
      return {
        questionNo: Number(row.question_no),
        category: String(row.reflection_category),
        mistakeReason: row.mistake_reason ? String(row.mistake_reason) : null
      };
    }),
    overall: overall ? {
      strengths: parseJsonArray_(overall.strengths_json),
      regrets: parseJsonArray_(overall.regrets_json),
      nextAction: String(overall.next_action || ''),
      freeNote: String(overall.free_note || '')
    } : { strengths: [], regrets: [], nextAction: '', freeNote: '' },
    helpRequests: helpRows.map(function (row) {
      return { questionNo: Number(row.question_no), helpTypes: parseJsonArray_(row.help_types_json), note: String(row.note || '') };
    })
  };
}

function getStudentExamStateAction_(payload) {
  var session = requireSession_(payload.sessionToken);
  var student = getStudentById_(session.studentId);
  var exam = assertExamForStudent_(payload.examId, student, false);
  var detail = examDetail_(exam);
  var matches = readRows_('submissions').filter(function (row) {
    return String(row.student_id) === session.studentId && String(row.exam_id) === String(exam.exam_id);
  });
  if (!matches.length) {
    if (!examIsOpenNow_(exam)) throw apiError_('EXAM_NOT_OPEN', '현재 응시할 수 있는 시험이 아닙니다.');
    return { state: 'NOT_STARTED', exam: detail };
  }
  if (matches.length > 1) throw apiError_('DATA_CONFLICT', '중복 제출 데이터가 있습니다. 선생님께 문의해주세요.');
  var submission = matches[0];
  var graded = gradedSubmissionFromRows_(submission, submissionItemsFor_(submission.submission_id));
  if (!isTrue_(submission.reflection_complete)) return { state: 'ANSWER_SUBMITTED', exam: detail, submission: graded };
  return {
    state: 'REFLECTION_COMPLETED',
    exam: detail,
    submission: graded,
    result: buildResult_(student, submission),
    savedReflection: savedReflectionFor_(submission.submission_id),
    canEditReflection: reflectionIsOpenNow_(exam)
  };
}
