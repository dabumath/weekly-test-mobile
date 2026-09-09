var API_ACTIONS_ = {
  LOGIN: login_,
  GET_EXAM: getExamAction_,
  GET_STUDENT_EXAM_STATE: getStudentExamStateAction_,
  SUBMIT_ANSWERS: submitAnswersAction_,
  SUBMIT_REFLECTION: submitReflectionAction_,
  GET_RESULT: getResultAction_
};

function doGet(event) {
  var template = HtmlService.createTemplateFromFile('Bridge');
  template.bridgeNonce = String(event && event.parameter && event.parameter.bridge_nonce || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 128);
  template.allowedParentOrigin = getRequiredProperty_(PROPERTY_KEYS_.ALLOWED_PARENT_ORIGIN);
  return template.evaluate()
    .setTitle('주간고사 보안 연결')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function handleApiRequest(action, payload, requestId) {
  try {
    var name = String(action || '');
    if (!Object.prototype.hasOwnProperty.call(API_ACTIONS_, name)) {
      throw apiError_('ACTION_NOT_ALLOWED', '허용되지 않은 요청입니다.');
    }
    var safeRequestId = String(requestId || '');
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(safeRequestId)) {
      throw apiError_('INVALID_INPUT', '요청 식별자가 올바르지 않습니다.');
    }
    var data = API_ACTIONS_[name](payload || {}, safeRequestId);
    return { ok: true, data: data };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: error && error.code ? String(error.code) : 'SERVER_ERROR',
        message: error && error.code ? String(error.message) : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'
      }
    };
  }
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('주간고사 시스템')
    .addItem('1. 비밀키 준비', 'initializeSecrets')
    .addItem('2. 현재 시트 연결', 'bindCurrentSpreadsheet')
    .addItem('3. 웹사이트 주소 연결', 'configureAllowedParentOrigin')
    .addItem('4. 학생 PIN 해시 생성', 'setupStudentPinHashesFromRoster')
    .addItem('테스트 계정 PIN 설정', 'setManualStudentPin')
    .addSeparator()
    .addItem('시험 데이터 검증', 'validateConfiguration')
    .addToUi();
}
