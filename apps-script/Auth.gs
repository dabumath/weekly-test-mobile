function login_(payload) {
  var name = normalizeNameCore(payload.name);
  var pin = String(payload.pin == null ? '' : payload.pin);
  if (!name || name.length > 30 || !/^\d{4}$/.test(pin)) {
    throw apiError_('AUTH_FAILED', '입력한 학생 정보를 확인해주세요.');
  }
  assertLoginRateAllowed_(name);

  var candidates = readRows_('students').filter(function (row) {
    var normalized = normalizeNameCore(row.normalized_name || row['학생명']);
    return isTrue_(row['사용 여부']) && normalized === name && String(row.pin_hash || '');
  });
  var expectedHash = pinHash_(name, pin);
  var matches = candidates.filter(function (row) { return constantTimeEqual_(String(row.pin_hash), expectedHash); });
  if (matches.length !== 1) {
    recordLoginFailure_(name);
    throw apiError_('AUTH_FAILED', '입력한 학생 정보를 확인해주세요.');
  }

  clearLoginFailures_(name);
  var student = matches[0];
  return {
    sessionToken: issueSession_(String(student.student_id)),
    student: {
      displayName: String(student['학생명']),
      className: String(student['정규반'])
    },
    activeExams: activeExamsForStudent_(student)
  };
}

function extractSpreadsheetId_(value) {
  var text = String(value || '').trim();
  var match = text.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (match) return match[1];
  if (/^[A-Za-z0-9_-]{20,}$/.test(text)) return text;
  throw new Error('학생 명단 스프레드시트 링크 또는 ID를 확인해주세요.');
}

function findRosterHeader_(sheet) {
  var rowCount = Math.min(sheet.getLastRow(), 12);
  var columnCount = sheet.getLastColumn();
  if (!rowCount || !columnCount) throw new Error(sheet.getName() + ' 시트가 비어 있습니다.');
  var values = sheet.getRange(1, 1, rowCount, columnCount).getDisplayValues();
  var aliases = {
    name: ['학생명', '이름'],
    teacher: ['담임', '담당', '담당 선생님', '담당선생님'],
    phone: ['연락처', '학생 연락처', '학생전화번호', '전화번호', '휴대전화', '핸드폰']
  };
  for (var row = 0; row < values.length; row += 1) {
    var trimmed = values[row].map(function (value) { return String(value).trim(); });
    var indexes = {};
    Object.keys(aliases).forEach(function (key) {
      indexes[key] = trimmed.findIndex(function (header) { return aliases[key].indexOf(header) >= 0; });
    });
    if (indexes.name >= 0 && indexes.teacher >= 0 && indexes.phone >= 0) {
      return { headerRow: row + 1, indexes: indexes };
    }
  }
  throw new Error(sheet.getName() + ' 시트에서 학생명·담임·연락처 헤더를 찾지 못했습니다.');
}

function rosterPinForStudent_(rosterSpreadsheet, student, headerCache) {
  var sheetName = String(student['원본 시트'] || '').trim();
  var sourceRow = Number(student['원본 행']);
  if (!sheetName || !Number.isInteger(sourceRow) || sourceRow < 2) {
    throw new Error(String(student.student_id) + ' 학생의 원본 시트/행 설정을 확인해주세요.');
  }
  var sheet = rosterSpreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error('원본 명단에서 ' + sheetName + ' 시트를 찾지 못했습니다.');
  var header = headerCache[sheetName] || (headerCache[sheetName] = findRosterHeader_(sheet));
  if (sourceRow <= header.headerRow || sourceRow > sheet.getLastRow()) {
    throw new Error(String(student.student_id) + ' 학생의 원본 행을 확인해주세요.');
  }
  var values = sheet.getRange(sourceRow, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  var sourceName = normalizeNameCore(values[header.indexes.name]);
  var targetName = normalizeNameCore(student.normalized_name || student['학생명']);
  var teacher = normalizeNameCore(values[header.indexes.teacher]);
  var digits = String(values[header.indexes.phone] || '').replace(/\D/g, '');
  if (sourceName !== targetName || teacher !== '다부') {
    throw new Error(String(student.student_id) + ' 학생의 이름 또는 담당 선생님이 원본 명단과 다릅니다.');
  }
  if (digits.length < 4) throw new Error(String(student.student_id) + ' 학생의 연락처를 확인해주세요.');
  return digits.slice(-4);
}

function setupStudentPinHashesFromRoster() {
  initializeSecretsSilently_();
  var properties = PropertiesService.getScriptProperties();
  var rosterId = properties.getProperty(PROPERTY_KEYS_.ROSTER_SPREADSHEET_ID);
  if (!rosterId) {
    var response = SpreadsheetApp.getUi().prompt(
      '학생 명단 연결',
      '담당 선생님과 연락처가 들어 있는 원본 학생 명단 스프레드시트 링크를 붙여 넣으세요.',
      SpreadsheetApp.getUi().ButtonSet.OK_CANCEL
    );
    if (response.getSelectedButton() !== SpreadsheetApp.getUi().Button.OK) return;
    rosterId = extractSpreadsheetId_(response.getResponseText());
    properties.setProperty(PROPERTY_KEYS_.ROSTER_SPREADSHEET_ID, rosterId);
  }

  var roster = SpreadsheetApp.openById(rosterId);
  var students = readRows_('students').filter(function (student) { return isTrue_(student['사용 여부']); });
  var manualStudents = students.filter(function (student) { return String(student['원본 시트'] || '').trim() === '수동 테스트'; });
  manualStudents.forEach(function (student) {
    if (!String(student.pin_hash || '')) {
      throw new Error(String(student.student_id) + ' 테스트 계정의 PIN을 먼저 설정해주세요.');
    }
  });
  var rosterStudents = students.filter(function (student) { return String(student['원본 시트'] || '').trim() !== '수동 테스트'; });
  var headerCache = {};
  var prepared = rosterStudents.map(function (student) {
    var normalizedName = normalizeNameCore(student.normalized_name || student['학생명']);
    var pin = rosterPinForStudent_(roster, student, headerCache);
    return {
      rowNumber: student._rowNumber,
      normalizedName: normalizedName,
      pinHash: pinHash_(normalizedName, pin)
    };
  });

  var authKeys = {};
  prepared.forEach(function (item) {
    var key = item.normalizedName + '|' + item.pinHash;
    if (authKeys[key]) throw new Error('이름과 확인번호가 같은 학생이 있어 로그인 정보를 구분할 수 없습니다.');
    authKeys[key] = true;
  });

  var table = getTable_('students');
  var pinColumn = table.headerIndex.pin_hash + 1;
  var statusColumn = table.headerIndex['PIN 상태'] + 1;
  var normalizedColumn = table.headerIndex.normalized_name + 1;
  prepared.forEach(function (item) {
    table.sheet.getRange(item.rowNumber, pinColumn).setValue(item.pinHash);
    table.sheet.getRange(item.rowNumber, statusColumn).setValue('설정 완료');
    table.sheet.getRange(item.rowNumber, normalizedColumn).setValue(item.normalizedName);
  });
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert(prepared.length + '명의 PIN 해시를 생성했습니다. 원본 확인번호는 운영 DB에 저장하지 않았습니다.');
}

function setManualStudentPin() {
  var ui = SpreadsheetApp.getUi();
  var nameResponse = ui.prompt(
    '테스트 계정 PIN 설정',
    '학생 시트에서 원본 시트가 "수동 테스트"인 계정의 이름을 입력하세요.',
    ui.ButtonSet.OK_CANCEL
  );
  if (nameResponse.getSelectedButton() !== ui.Button.OK) return;
  var normalizedName = normalizeNameCore(nameResponse.getResponseText());

  var pinResponse = ui.prompt(
    '확인번호 입력',
    '이 계정에서 사용할 숫자 4자리를 입력하세요. 평문은 저장하지 않습니다.',
    ui.ButtonSet.OK_CANCEL
  );
  if (pinResponse.getSelectedButton() !== ui.Button.OK) return;
  var pin = String(pinResponse.getResponseText() || '').trim();
  if (!/^\d{4}$/.test(pin)) throw new Error('확인번호는 숫자 4자리여야 합니다.');

  setManualStudentPinForAdmin(normalizedName, pin);
  ui.alert('테스트 계정 PIN 해시를 저장했습니다. 평문 확인번호는 저장하지 않았습니다.');
}

function setManualStudentPinForAdmin(name, pin) {
  initializeSecretsSilently_();
  var normalizedName = normalizeNameCore(name);
  var safePin = String(pin == null ? '' : pin).trim();
  if (!normalizedName || !/^\d{4}$/.test(safePin)) {
    throw new Error('테스트 계정 이름과 숫자 4자리 확인번호를 입력해주세요.');
  }
  var matches = readRows_('students').filter(function (student) {
    return isTrue_(student['사용 여부']) &&
      String(student['원본 시트'] || '').trim() === '수동 테스트' &&
      normalizeNameCore(student.normalized_name || student['학생명']) === normalizedName;
  });
  if (matches.length !== 1) throw new Error('수동 테스트 계정을 한 개만 찾을 수 있도록 학생 시트를 확인해주세요.');

  updateObjectRow_('students', matches[0]._rowNumber, {
    pin_hash: pinHash_(normalizedName, safePin),
    'PIN 상태': '설정 완료',
    normalized_name: normalizedName
  });
  SpreadsheetApp.flush();
  return { studentId: String(matches[0].student_id), pinConfigured: true };
}

function initializeSecretsSilently_() {
  var properties = PropertiesService.getScriptProperties();
  var updates = {};
  if (!properties.getProperty(PROPERTY_KEYS_.TOKEN_SECRET)) updates[PROPERTY_KEYS_.TOKEN_SECRET] = randomSecret_();
  if (!properties.getProperty(PROPERTY_KEYS_.PIN_PEPPER)) updates[PROPERTY_KEYS_.PIN_PEPPER] = randomSecret_();
  if (!properties.getProperty(PROPERTY_KEYS_.SESSION_IDLE_MINUTES)) updates[PROPERTY_KEYS_.SESSION_IDLE_MINUTES] = '30';
  if (!properties.getProperty(PROPERTY_KEYS_.SESSION_MAX_MINUTES)) updates[PROPERTY_KEYS_.SESSION_MAX_MINUTES] = '120';
  if (!properties.getProperty(PROPERTY_KEYS_.AVERAGE_MIN_SUBMISSIONS)) updates[PROPERTY_KEYS_.AVERAGE_MIN_SUBMISSIONS] = '3';
  if (Object.keys(updates).length) properties.setProperties(updates, false);
}
