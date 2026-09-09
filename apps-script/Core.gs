/**
 * Pure domain functions. Keep this file free of Apps Script services so the
 * grading and reflection rules can also be tested with Node.
 */

var REVIEW_CATEGORIES_ = [
  'SOLVED_CORRECT',
  'LUCKY_CORRECT',
  'UNKNOWN_WRONG',
  'MISTAKE_WRONG',
  'TIME_SHORTAGE_WRONG'
];

var MISTAKE_REASONS_ = [
  'CALCULATION',
  'SIGN',
  'CONDITION_MISSED',
  'MISREAD',
  'ANSWER_TRANSCRIPTION',
  'FORMULA_CONFUSION',
  'NO_REVIEW',
  'OTHER'
];

var HELP_TYPES_ = [
  'CONCEPT_EXPLANATION',
  'TYPE_EXPLANATION',
  'SIMILAR_PROBLEM',
  'OTHER'
];

function normalizeNameCore(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function requireStringCore(value, field, maxLength) {
  var text = String(value == null ? '' : value).trim();
  if (!text) throw new Error(field + ' 값이 비어 있습니다.');
  if (maxLength && text.length > maxLength) throw new Error(field + ' 값이 너무 깁니다.');
  return text;
}

function asFiniteNumberCore(value, field) {
  var number = Number(value);
  if (!Number.isFinite(number)) throw new Error(field + ' 값이 숫자가 아닙니다.');
  return number;
}

function gradeAnswersCore(questions, submittedAnswers, choiceCount, expectedTotal) {
  if (!Array.isArray(questions) || !questions.length) throw new Error('문항 정보가 없습니다.');
  if (!Array.isArray(submittedAnswers)) throw new Error('답안 형식이 올바르지 않습니다.');

  var choices = asFiniteNumberCore(choiceCount, '선택지 수');
  if (!Number.isInteger(choices) || choices < 2 || choices > 9) {
    throw new Error('선택지 수 설정을 확인해주세요.');
  }

  var sorted = questions.slice().sort(function (a, b) {
    return Number(a.questionNo) - Number(b.questionNo);
  });
  var answerByNo = {};
  submittedAnswers.forEach(function (item) {
    var no = Number(item && item.questionNo);
    if (!Number.isInteger(no) || answerByNo[no] !== undefined) {
      throw new Error('중복되거나 잘못된 문항 번호가 있습니다.');
    }
    var answer = item.answer;
    if (answer !== null && answer !== undefined) {
      answer = Number(answer);
      if (!Number.isInteger(answer) || answer < 1 || answer > choices) {
        throw new Error(no + '번 답안을 확인해주세요.');
      }
    } else {
      answer = null;
    }
    answerByNo[no] = answer;
  });

  if (submittedAnswers.length !== sorted.length) {
    throw new Error('모든 문항의 답안 정보가 필요합니다.');
  }

  var pointTotal = 0;
  var rawScore = 0;
  var graded = sorted.map(function (question, index) {
    var questionNo = Number(question.questionNo);
    if (!Number.isInteger(questionNo) || questionNo !== index + 1) {
      throw new Error('문항 번호가 1번부터 연속되어야 합니다.');
    }
    if (answerByNo[questionNo] === undefined) {
      throw new Error(questionNo + '번 답안 정보가 없습니다.');
    }
    var correctAnswer = Number(question.correctAnswer);
    if (!Number.isInteger(correctAnswer) || correctAnswer < 1 || correctAnswer > choices) {
      throw new Error(questionNo + '번 정답 설정을 확인해주세요.');
    }
    var points = asFiniteNumberCore(question.points, questionNo + '번 배점');
    if (points < 0) throw new Error(questionNo + '번 배점은 0 이상이어야 합니다.');
    pointTotal += points;
    var studentAnswer = answerByNo[questionNo];
    var isCorrect = studentAnswer === correctAnswer;
    var earnedPoints = isCorrect ? points : 0;
    rawScore += earnedPoints;
    return {
      questionNo: questionNo,
      questionType: question.questionType || 'MCQ',
      points: points,
      studentAnswer: studentAnswer,
      correctAnswer: correctAnswer,
      isCorrect: isCorrect,
      earnedPoints: earnedPoints
    };
  });

  var total = asFiniteNumberCore(expectedTotal, '총점');
  if (Math.abs(pointTotal - total) > 0.000001) {
    throw new Error('문항 배점 합계와 시험 총점이 일치하지 않습니다.');
  }
  return { rawScore: rawScore, totalScore: total, questions: graded };
}

function validateReflectionCore(gradedQuestions, items) {
  if (!Array.isArray(gradedQuestions) || !gradedQuestions.length) {
    throw new Error('채점 문항 정보가 없습니다.');
  }
  if (!Array.isArray(items)) throw new Error('복기 형식이 올바르지 않습니다.');

  var byNo = {};
  items.forEach(function (item) {
    var no = Number(item && item.questionNo);
    if (!Number.isInteger(no) || byNo[no]) throw new Error('복기 문항 번호가 중복되었습니다.');
    byNo[no] = item;
  });
  if (items.length !== gradedQuestions.length) throw new Error('모든 문항의 복기를 완료해주세요.');

  gradedQuestions.forEach(function (question) {
    var no = Number(question.questionNo);
    var item = byNo[no];
    if (!item) throw new Error(no + '번 문항의 복기를 완료해주세요.');
    var allowed = question.isCorrect
      ? ['SOLVED_CORRECT', 'LUCKY_CORRECT']
      : ['UNKNOWN_WRONG', 'MISTAKE_WRONG', 'TIME_SHORTAGE_WRONG'];
    if (allowed.indexOf(item.category) < 0) {
      throw new Error(no + '번 문항의 복기 선택을 확인해주세요.');
    }
    var reason = item.mistakeReason == null || item.mistakeReason === '' ? null : item.mistakeReason;
    if (item.category !== 'MISTAKE_WRONG' && reason) {
      throw new Error(no + '번 문항의 실수 원인을 확인해주세요.');
    }
    if (reason && MISTAKE_REASONS_.indexOf(reason) < 0) {
      throw new Error(no + '번 문항의 실수 원인이 올바르지 않습니다.');
    }
  });
  return true;
}

function computeReflectionScoreCore(gradedQuestions, items) {
  validateReflectionCore(gradedQuestions, items);
  var byNo = {};
  items.forEach(function (item) { byNo[Number(item.questionNo)] = item; });
  var counts = {};
  REVIEW_CATEGORIES_.forEach(function (category) { counts[category] = 0; });
  var rawScore = 0;
  var luckyDeduction = 0;
  var mistakeRecovery = 0;
  gradedQuestions.forEach(function (question) {
    var points = Number(question.points);
    var category = byNo[Number(question.questionNo)].category;
    if (question.isCorrect) rawScore += points;
    if (category === 'LUCKY_CORRECT') luckyDeduction += points;
    if (category === 'MISTAKE_WRONG') mistakeRecovery += points;
    counts[category] += 1;
  });
  return {
    rawScore: rawScore,
    luckyDeduction: luckyDeduction,
    mistakeRecovery: mistakeRecovery,
    adjustedScore: rawScore - luckyDeduction + mistakeRecovery,
    counts: counts
  };
}

function validateHelpRequestsCore(helpRequests, validQuestionNumbers) {
  if (!Array.isArray(helpRequests)) throw new Error('도움 요청 형식이 올바르지 않습니다.');
  var allowedQuestions = {};
  validQuestionNumbers.forEach(function (number) { allowedQuestions[Number(number)] = true; });
  var seen = {};
  return helpRequests.map(function (request) {
    var no = Number(request && request.questionNo);
    if (!allowedQuestions[no] || seen[no]) throw new Error('도움 요청 문항을 확인해주세요.');
    seen[no] = true;
    if (!Array.isArray(request.helpTypes) || !request.helpTypes.length) {
      throw new Error(no + '번 도움 유형을 하나 이상 선택해주세요.');
    }
    var uniqueTypes = [];
    request.helpTypes.forEach(function (type) {
      if (HELP_TYPES_.indexOf(type) < 0) throw new Error(no + '번 도움 유형이 올바르지 않습니다.');
      if (uniqueTypes.indexOf(type) < 0) uniqueTypes.push(type);
    });
    var note = String(request.note == null ? '' : request.note).trim();
    if (note.length > 500) throw new Error(no + '번 도움 요청 메모가 너무 깁니다.');
    return { questionNo: no, helpTypes: uniqueTypes, note: note };
  });
}
