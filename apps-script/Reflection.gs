function validateOverallReflection_(overall) {
  var value = overall && typeof overall === 'object' ? overall : {};
  function cleanList(input, field) {
    if (!Array.isArray(input)) throw apiError_('INVALID_INPUT', field + ' 형식을 확인해주세요.');
    if (input.length > 12) throw apiError_('INVALID_INPUT', field + ' 항목이 너무 많습니다.');
    return input.map(function (item) { return requireStringCore(item, field, 100); });
  }
  var freeNote = String(value.freeNote == null ? '' : value.freeNote).trim();
  if (freeNote.length > 500) throw apiError_('INVALID_INPUT', '메모가 너무 깁니다.');
  return {
    strengths: cleanList(value.strengths || [], '잘한 점'),
    regrets: cleanList(value.regrets || [], '아쉬운 점'),
    nextAction: requireStringCore(value.nextAction, '다음 시험 행동', 200),
    freeNote: freeNote
  };
}

function reflectionItemsByQuestion_(items) {
  var byNo = {};
  items.forEach(function (item) { byNo[Number(item.questionNo)] = item; });
  return byNo;
}

function upsertOverallReflection_(submission, overall, now) {
  var matches = readRows_('overallReflections').filter(function (row) {
    return String(row.submission_id) === String(submission.submission_id);
  });
  if (matches.length > 1) throw apiError_('DATA_CONFLICT', '전체 복기 데이터가 중복되었습니다. 선생님께 문의해주세요.');
  var object = {
    submission_id: String(submission.submission_id),
    student_id: String(submission.student_id),
    exam_id: String(submission.exam_id),
    strengths_json: JSON.stringify(overall.strengths),
    regrets_json: JSON.stringify(overall.regrets),
    next_action: overall.nextAction,
    free_note: overall.freeNote,
    submitted_at: matches.length ? matches[0].submitted_at : now,
    updated_at: now
  };
  if (!matches.length) appendObjects_('overallReflections', [object]);
  else updateObjectRow_('overallReflections', matches[0]._rowNumber, object);
}

function upsertHelpRequests_(submission, helpRequests, now) {
  var existing = readRows_('helpRequests').filter(function (row) {
    return String(row.submission_id) === String(submission.submission_id);
  });
  var existingByQuestion = {};
  existing.forEach(function (row) {
    var no = Number(row.question_no);
    if (existingByQuestion[no]) throw apiError_('DATA_CONFLICT', '도움 요청 데이터가 중복되었습니다. 선생님께 문의해주세요.');
    existingByQuestion[no] = row;
  });
  var incomingByQuestion = {};
  helpRequests.forEach(function (request) { incomingByQuestion[request.questionNo] = request; });

  existing.forEach(function (row) {
    var no = Number(row.question_no);
    if (!incomingByQuestion[no] && isTrue_(row.active)) {
      updateObjectRow_('helpRequests', row._rowNumber, { active: false, updated_at: now });
    }
  });

  var additions = [];
  helpRequests.forEach(function (request) {
    var prior = existingByQuestion[request.questionNo];
    var changes = {
      help_types_json: JSON.stringify(request.helpTypes),
      note: request.note,
      status: 'NEW',
      updated_at: now,
      active: true
    };
    if (prior) {
      updateObjectRow_('helpRequests', prior._rowNumber, changes);
    } else {
      additions.push({
        help_request_id: 'help_' + Utilities.getUuid().replace(/-/g, ''),
        submission_id: String(submission.submission_id),
        student_id: String(submission.student_id),
        exam_id: String(submission.exam_id),
        question_no: request.questionNo,
        help_types_json: JSON.stringify(request.helpTypes),
        note: request.note,
        status: 'NEW',
        requested_at: now,
        updated_at: now,
        active: true
      });
    }
  });
  if (additions.length) appendObjects_('helpRequests', additions);
}

function submitReflectionAction_(payload) {
  var session = requireSession_(payload.sessionToken);
  var student = getStudentById_(session.studentId);
  var submissionId = requireStringCore(payload.submissionId, '제출 번호', 128);
  var overall = validateOverallReflection_(payload.overall);

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (error) {
    throw apiError_('SERVER_BUSY', '제출이 몰리고 있습니다. 잠시 후 다시 눌러주세요.');
  }
  try {
    var submission = getSubmissionById_(submissionId);
    if (String(submission.student_id) !== session.studentId) throw apiError_('SUBMISSION_NOT_FOUND', '제출 정보를 불러오지 못했습니다.');
    var exam = assertExamForStudent_(submission.exam_id, student, false);
    if (!reflectionIsOpenNow_(exam)) throw apiError_('REFLECTION_CLOSED', '복기 제출이 마감되었습니다.');

    var itemRows = submissionItemsFor_(submissionId);
    if (itemRows.length !== Number(exam['문항 수'])) throw apiError_('DATA_CONFLICT', '제출 문항 수가 시험 설정과 다릅니다. 선생님께 문의해주세요.');
    var gradedQuestions = itemRows.map(gradedQuestionFromRow_);
    try {
      validateReflectionCore(gradedQuestions, payload.items);
    } catch (error) {
      throw apiError_('INVALID_INPUT', error.message);
    }
    var helpRequests;
    try {
      helpRequests = validateHelpRequestsCore(payload.helpRequests || [], gradedQuestions.map(function (question) { return question.questionNo; }));
    } catch (error) {
      throw apiError_('INVALID_INPUT', error.message);
    }

    var byNo = reflectionItemsByQuestion_(payload.items);
    var now = new Date().toISOString();
    itemRows.forEach(function (row) {
      var item = byNo[Number(row.question_no)];
      updateObjectRow_('submissionItems', row._rowNumber, {
        reflection_category: item.category,
        mistake_reason: item.mistakeReason || '',
        updated_at: now
      });
    });
    upsertOverallReflection_(submission, overall, now);
    upsertHelpRequests_(submission, helpRequests, now);
    updateObjectRow_('submissions', submission._rowNumber, {
      reflection_complete: true,
      reflection_completed_at: now,
      updated_at: now
    });
    SpreadsheetApp.flush();
    return buildResult_(student, getSubmissionById_(submissionId));
  } finally {
    lock.releaseLock();
  }
}

function reflectionScoreFromItemRows_(itemRows) {
  var questions = itemRows.map(gradedQuestionFromRow_);
  var items = itemRows.map(function (row) {
    return {
      questionNo: Number(row.question_no),
      category: String(row.reflection_category || ''),
      mistakeReason: row.mistake_reason ? String(row.mistake_reason) : null
    };
  });
  return computeReflectionScoreCore(questions, items);
}

function average_(numbers) {
  if (!numbers.length) return null;
  return numbers.reduce(function (sum, number) { return sum + Number(number); }, 0) / numbers.length;
}

function buildResult_(student, submission) {
  var ownItemRows = submissionItemsFor_(submission.submission_id);
  var score;
  try {
    score = reflectionScoreFromItemRows_(ownItemRows);
  } catch (error) {
    throw apiError_('REFLECTION_INCOMPLETE', '복기 정보를 완성해주세요.');
  }
  var students = readRows_('students');
  var allItemRows = readRows_('submissionItems');
  var classByStudent = {};
  students.forEach(function (row) { classByStudent[String(row.student_id)] = String(row['정규반']); });
  var sameClass = readRows_('submissions').filter(function (row) {
    return String(row.exam_id) === String(submission.exam_id) && classByStudent[String(row.student_id)] === String(student['정규반']);
  });
  var rawScores = sameClass.map(function (row) { return Number(row.raw_score); }).filter(Number.isFinite);
  var completed = sameClass.filter(function (row) { return isTrue_(row.reflection_complete); });
  var adjustedScores = completed.map(function (row) {
    var rows = allItemRows.filter(function (item) { return String(item.submission_id) === String(row.submission_id); })
      .sort(function (a, b) { return Number(a.question_no) - Number(b.question_no); });
    try { return reflectionScoreFromItemRows_(rows).adjustedScore; }
    catch (error) { return null; }
  }).filter(function (value) { return value !== null && Number.isFinite(value); });
  var minimum = getNumberProperty_(PROPERTY_KEYS_.AVERAGE_MIN_SUBMISSIONS, 3);
  var activeHelpCount = readRows_('helpRequests').filter(function (row) {
    return String(row.submission_id) === String(submission.submission_id) && isTrue_(row.active);
  }).length;
  var graded = gradedSubmissionFromRows_(submission, ownItemRows);
  return {
    submissionId: graded.submissionId,
    examId: graded.examId,
    rawScore: score.rawScore,
    totalScore: graded.totalScore,
    submittedAt: graded.submittedAt,
    questions: graded.questions,
    luckyDeduction: score.luckyDeduction,
    mistakeRecovery: score.mistakeRecovery,
    adjustedScore: score.adjustedScore,
    counts: score.counts,
    helpRequestCount: activeHelpCount,
    rawAverage: rawScores.length >= minimum ? average_(rawScores) : null,
    rawAverageCount: rawScores.length,
    adjustedAverage: adjustedScores.length >= minimum ? average_(adjustedScores) : null,
    adjustedAverageCount: adjustedScores.length,
    averageLabel: rawScores.length >= minimum ? '반 평균' : '현재 제출자 평균'
  };
}

function getResultAction_(payload) {
  var session = requireSession_(payload.sessionToken);
  var student = getStudentById_(session.studentId);
  var submission = getSubmissionById_(payload.submissionId);
  if (String(submission.student_id) !== session.studentId || !isTrue_(submission.reflection_complete)) {
    throw apiError_('SUBMISSION_NOT_FOUND', '결과를 불러오지 못했습니다.');
  }
  return buildResult_(student, submission);
}
