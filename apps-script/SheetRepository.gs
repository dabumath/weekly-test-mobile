var TABLE_DEFINITIONS_ = {
  exams: {
    sheet: '시험', headerRow: 6,
    required: ['exam_id', '시험명', '학년', '대상 반', '과목', '회차', '문항 수', '총점', '상태', '공개 시작', '제출 마감', '복기 마감', '선택지 수']
  },
  students: {
    sheet: '학생', headerRow: 6,
    required: ['student_id', '학생명', '정규반', '학년', '담당', '사용 여부', 'pin_hash', 'PIN 상태', '원본 시트', '원본 행', 'normalized_name']
  },
  questions: {
    sheet: '문항', headerRow: 6,
    required: ['exam_id', '과목', '문항', '정답', '배점', '문항 유형']
  },
  submissions: {
    sheet: '제출', headerRow: 1,
    required: ['submission_id', 'client_request_id', 'student_id', 'exam_id', 'submitted_at', 'raw_score', 'total_score', 'answer_locked', 'reflection_complete', 'reflection_completed_at', 'created_at', 'updated_at']
  },
  submissionItems: {
    sheet: '제출문항', headerRow: 1,
    required: ['submission_id', 'student_id', 'exam_id', 'question_no', 'student_answer', 'correct_answer', 'points', 'is_correct', 'earned_points', 'reflection_category', 'mistake_reason', 'updated_at']
  },
  overallReflections: {
    sheet: '전체복기', headerRow: 1,
    required: ['submission_id', 'student_id', 'exam_id', 'strengths_json', 'regrets_json', 'next_action', 'free_note', 'submitted_at', 'updated_at']
  },
  helpRequests: {
    sheet: '도움요청', headerRow: 1,
    required: ['help_request_id', 'submission_id', 'student_id', 'exam_id', 'question_no', 'help_types_json', 'note', 'status', 'requested_at', 'updated_at', 'active']
  }
};

function getDataSpreadsheet_() {
  return SpreadsheetApp.openById(getRequiredProperty_(PROPERTY_KEYS_.SPREADSHEET_ID));
}

function getTable_(key) {
  var definition = TABLE_DEFINITIONS_[key];
  if (!definition) throw new Error('Unknown table: ' + key);
  var sheet = getDataSpreadsheet_().getSheetByName(definition.sheet);
  if (!sheet) throw apiError_('SERVER_NOT_CONFIGURED', definition.sheet + ' 시트를 찾을 수 없습니다.');
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) throw apiError_('SERVER_NOT_CONFIGURED', definition.sheet + ' 시트의 헤더가 없습니다.');
  var headers = sheet.getRange(definition.headerRow, 1, 1, lastColumn).getDisplayValues()[0].map(function (value) {
    return String(value).trim();
  });
  definition.required.forEach(function (header) {
    if (headers.indexOf(header) < 0) throw apiError_('SERVER_NOT_CONFIGURED', definition.sheet + ' 시트에 ' + header + ' 열이 없습니다.');
  });
  var headerIndex = {};
  headers.forEach(function (header, index) { if (header) headerIndex[header] = index; });
  return { sheet: sheet, headerRow: definition.headerRow, headers: headers, headerIndex: headerIndex };
}

function readRows_(key) {
  var table = getTable_(key);
  var lastRow = table.sheet.getLastRow();
  if (lastRow <= table.headerRow) return [];
  var values = table.sheet.getRange(table.headerRow + 1, 1, lastRow - table.headerRow, table.headers.length).getValues();
  return values.map(function (row, rowOffset) {
    var object = { _rowNumber: table.headerRow + 1 + rowOffset };
    table.headers.forEach(function (header, column) { if (header) object[header] = row[column]; });
    return object;
  }).filter(function (row) {
    return table.headers.some(function (header) { return header && row[header] !== '' && row[header] !== null; });
  });
}

function rowValues_(headers, object) {
  return headers.map(function (header) {
    var value = object[header];
    return value === undefined || value === null ? '' : value;
  });
}

function appendObjects_(key, objects) {
  if (!objects.length) return [];
  var table = getTable_(key);
  var startRow = Math.max(table.sheet.getLastRow() + 1, table.headerRow + 1);
  var rows = objects.map(function (object) { return rowValues_(table.headers, object); });
  table.sheet.getRange(startRow, 1, rows.length, table.headers.length).setValues(rows);
  return rows.map(function (_, index) { return startRow + index; });
}

function updateObjectRow_(key, rowNumber, changes) {
  var table = getTable_(key);
  var range = table.sheet.getRange(rowNumber, 1, 1, table.headers.length);
  var values = range.getValues()[0];
  Object.keys(changes).forEach(function (header) {
    var column = table.headerIndex[header];
    if (column === undefined) throw apiError_('SERVER_NOT_CONFIGURED', table.sheet.getName() + ' 시트에 ' + header + ' 열이 없습니다.');
    var value = changes[header];
    values[column] = value === undefined || value === null ? '' : value;
  });
  range.setValues([values]);
}

function updateObjectRows_(key, updates) {
  if (!updates.length) return;
  updates.forEach(function (update) { updateObjectRow_(key, update.rowNumber, update.changes); });
}

function asIsoString_(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (!value) return '';
  var parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function isTrue_(value) {
  return value === true || String(value).toUpperCase() === 'TRUE' || String(value) === '1' || String(value) === '사용';
}

function parseJsonArray_(value) {
  if (!value) return [];
  try {
    var parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function getStudentById_(studentId) {
  var matches = readRows_('students').filter(function (row) { return String(row.student_id) === String(studentId); });
  if (matches.length !== 1 || !isTrue_(matches[0]['사용 여부'])) throw apiError_('STUDENT_NOT_FOUND', '학생 정보를 확인해주세요.');
  return matches[0];
}

function getSubmissionById_(submissionId) {
  var matches = readRows_('submissions').filter(function (row) { return String(row.submission_id) === String(submissionId); });
  if (matches.length !== 1) throw apiError_('SUBMISSION_NOT_FOUND', '제출 정보를 불러오지 못했습니다.');
  return matches[0];
}

function submissionItemsFor_(submissionId) {
  return readRows_('submissionItems').filter(function (row) {
    return String(row.submission_id) === String(submissionId);
  }).sort(function (a, b) { return Number(a.question_no) - Number(b.question_no); });
}

function bindCurrentSpreadsheet() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('현재 스프레드시트를 확인할 수 없습니다.');
  PropertiesService.getScriptProperties().setProperty(PROPERTY_KEYS_.SPREADSHEET_ID, spreadsheet.getId());
  SpreadsheetApp.getUi().alert('현재 시트를 운영 DB로 연결했습니다.');
}
