function configureAllowedParentOrigin() {
  var ui = SpreadsheetApp.getUi();
  var current = PropertiesService.getScriptProperties().getProperty(PROPERTY_KEYS_.ALLOWED_PARENT_ORIGIN) || '';
  var response = ui.prompt(
    '웹사이트 주소 연결',
    '학생용 웹사이트의 origin만 입력하세요. 예: https://example.github.io\n현재 값: ' + (current || '미설정'),
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  var input = String(response.getResponseText() || '').trim().replace(/\/$/, '');
  var secureOrigin = /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(input);
  var localOrigin = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(input);
  if (!secureOrigin && !localOrigin) {
    throw new Error('경로 없이 정확한 origin만 입력해주세요. 예: https://example.github.io');
  }
  PropertiesService.getScriptProperties().setProperty(PROPERTY_KEYS_.ALLOWED_PARENT_ORIGIN, input);
  ui.alert('허용할 웹사이트 주소를 저장했습니다.');
}

function configureDeploymentForAdmin(spreadsheetId, allowedOrigin) {
  var safeSpreadsheetId = String(spreadsheetId || '').trim();
  var safeOrigin = String(allowedOrigin || '').trim().replace(/\/$/, '');
  if (!/^[A-Za-z0-9_-]{20,}$/.test(safeSpreadsheetId)) {
    throw new Error('올바른 스프레드시트 ID를 입력해주세요.');
  }
  var secureOrigin = /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(safeOrigin);
  var localOrigin = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(safeOrigin);
  if (!secureOrigin && !localOrigin) {
    throw new Error('경로 없이 정확한 origin만 입력해주세요.');
  }
  initializeSecretsSilently_();
  PropertiesService.getScriptProperties().setProperties({
    SPREADSHEET_ID: safeSpreadsheetId,
    ALLOWED_PARENT_ORIGIN: safeOrigin
  }, false);
  return { spreadsheetConfigured: true, allowedOrigin: safeOrigin };
}

function assertUniqueValues_(rows, field, label) {
  var seen = {};
  rows.forEach(function (row) {
    var value = String(row[field] || '').trim();
    if (!value) throw new Error(label + ' 값이 비어 있습니다.');
    if (seen[value]) throw new Error(label + ' 값이 중복되었습니다: ' + value);
    seen[value] = true;
  });
}

function validateConfiguration() {
  Object.keys(TABLE_DEFINITIONS_).forEach(getTable_);
  var exams = readRows_('exams');
  var students = readRows_('students').filter(function (row) { return isTrue_(row['사용 여부']); });
  assertUniqueValues_(exams, 'exam_id', 'exam_id');
  assertUniqueValues_(students, 'student_id', 'student_id');
  if (!exams.length) throw new Error('등록된 시험이 없습니다.');
  if (!students.length) throw new Error('사용 중인 학생이 없습니다.');

  exams.forEach(function (exam) {
    var count = Number(exam['문항 수']);
    var questions = questionRecords_(exam);
    if (questions.length !== count) throw new Error(String(exam.exam_id) + '의 문항 수가 시험 설정과 다릅니다.');
    gradeAnswersCore(questions, questions.map(function (question) {
      return { questionNo: question.questionNo, answer: null };
    }), Number(exam['선택지 수']), Number(exam['총점']));
  });

  students.forEach(function (student) {
    if (normalizeNameCore(student.normalized_name) !== normalizeNameCore(student['학생명'])) {
      throw new Error(String(student.student_id) + ' 학생의 normalized_name을 확인해주세요.');
    }
  });

  var properties = PropertiesService.getScriptProperties();
  var missing = [
    PROPERTY_KEYS_.SPREADSHEET_ID,
    PROPERTY_KEYS_.TOKEN_SECRET,
    PROPERTY_KEYS_.PIN_PEPPER,
    PROPERTY_KEYS_.ALLOWED_PARENT_ORIGIN
  ].filter(function (key) { return !properties.getProperty(key); });
  var pinsReady = students.filter(function (student) { return String(student.pin_hash || ''); }).length;
  var message = [
    '시험 ' + exams.length + '개',
    '사용 학생 ' + students.length + '명',
    'PIN 설정 ' + pinsReady + '명',
    '문항/배점 검증 완료'
  ];
  if (missing.length) message.push('미설정 속성: ' + missing.join(', '));
  SpreadsheetApp.getUi().alert(message.join('\n'));
  return { exams: exams.length, students: students.length, pinsReady: pinsReady, missingProperties: missing };
}
