var PROPERTY_KEYS_ = {
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  ROSTER_SPREADSHEET_ID: 'ROSTER_SPREADSHEET_ID',
  TOKEN_SECRET: 'TOKEN_SECRET',
  PIN_PEPPER: 'PIN_PEPPER',
  ALLOWED_PARENT_ORIGIN: 'ALLOWED_PARENT_ORIGIN',
  SESSION_IDLE_MINUTES: 'SESSION_IDLE_MINUTES',
  SESSION_MAX_MINUTES: 'SESSION_MAX_MINUTES',
  AVERAGE_MIN_SUBMISSIONS: 'AVERAGE_MIN_SUBMISSIONS'
};

function apiError_(code, message) {
  var error = new Error(message);
  error.code = code;
  return error;
}

function getRequiredProperty_(key) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw apiError_('SERVER_NOT_CONFIGURED', '서버 설정이 완료되지 않았습니다. 선생님께 문의해주세요.');
  return value;
}

function getNumberProperty_(key, fallback) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  var number = Number(value || fallback);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function randomSecret_() {
  var seed = Utilities.getUuid() + Utilities.getUuid() + String(Date.now()) + Math.random();
  return toWebSafeBase64_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed));
}

function toWebSafeBase64_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function utf8Bytes_(text) {
  return Utilities.newBlob(String(text)).getBytes();
}

function hmacWebSafe_(message, secret) {
  return toWebSafeBase64_(Utilities.computeHmacSha256Signature(String(message), String(secret)));
}

function sha256WebSafe_(message) {
  return toWebSafeBase64_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, utf8Bytes_(message)));
}

function constantTimeEqual_(left, right) {
  var a = String(left || '');
  var b = String(right || '');
  var mismatch = a.length ^ b.length;
  var length = Math.max(a.length, b.length);
  for (var i = 0; i < length; i += 1) {
    mismatch |= (a.charCodeAt(i % Math.max(a.length, 1)) || 0) ^ (b.charCodeAt(i % Math.max(b.length, 1)) || 0);
  }
  return mismatch === 0;
}

function pinHash_(normalizedName, pin) {
  return hmacWebSafe_(normalizeNameCore(normalizedName) + '\n' + String(pin), getRequiredProperty_(PROPERTY_KEYS_.PIN_PEPPER));
}

function encodeJson_(value) {
  return toWebSafeBase64_(utf8Bytes_(JSON.stringify(value)));
}

function decodeJson_(value) {
  try {
    return JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(value)).getDataAsString('UTF-8'));
  } catch (error) {
    throw apiError_('SESSION_INVALID', '로그인이 만료되었습니다. 다시 로그인해주세요.');
  }
}

function sessionCacheKey_(token) {
  return 'session:' + sha256WebSafe_(token).slice(0, 40);
}

function issueSession_(studentId) {
  var now = Date.now();
  var maxMinutes = getNumberProperty_(PROPERTY_KEYS_.SESSION_MAX_MINUTES, 120);
  var payload = {
    v: 1,
    sub: String(studentId),
    iat: now,
    exp: now + maxMinutes * 60 * 1000,
    nonce: Utilities.getUuid()
  };
  var encoded = encodeJson_(payload);
  var signature = hmacWebSafe_(encoded, getRequiredProperty_(PROPERTY_KEYS_.TOKEN_SECRET));
  var token = encoded + '.' + signature;
  CacheService.getScriptCache().put(sessionCacheKey_(token), JSON.stringify({
    studentId: payload.sub,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
    lastSeenAt: now
  }), Math.min(maxMinutes * 60, 21600));
  return token;
}

function requireSession_(token) {
  var raw = requireStringCore(token, '세션', 4096);
  var parts = raw.split('.');
  if (parts.length !== 2) throw apiError_('SESSION_INVALID', '로그인이 만료되었습니다. 다시 로그인해주세요.');
  var expected = hmacWebSafe_(parts[0], getRequiredProperty_(PROPERTY_KEYS_.TOKEN_SECRET));
  if (!constantTimeEqual_(expected, parts[1])) throw apiError_('SESSION_INVALID', '로그인이 만료되었습니다. 다시 로그인해주세요.');
  var payload = decodeJson_(parts[0]);
  var now = Date.now();
  if (!payload || payload.v !== 1 || !payload.sub || Number(payload.exp) <= now) {
    throw apiError_('SESSION_EXPIRED', '로그인이 만료되었습니다. 다시 로그인해주세요.');
  }
  var cache = CacheService.getScriptCache();
  var key = sessionCacheKey_(raw);
  var cachedText = cache.get(key);
  if (!cachedText) throw apiError_('SESSION_EXPIRED', '로그인이 만료되었습니다. 다시 로그인해주세요.');
  var state;
  try { state = JSON.parse(cachedText); } catch (error) { state = null; }
  var idleMs = getNumberProperty_(PROPERTY_KEYS_.SESSION_IDLE_MINUTES, 30) * 60 * 1000;
  if (!state || state.studentId !== payload.sub || now - Number(state.lastSeenAt) > idleMs || Number(state.expiresAt) <= now) {
    cache.remove(key);
    throw apiError_('SESSION_EXPIRED', '로그인이 만료되었습니다. 다시 로그인해주세요.');
  }
  state.lastSeenAt = now;
  cache.put(key, JSON.stringify(state), Math.min(Math.ceil((Number(state.expiresAt) - now) / 1000), 21600));
  return { studentId: String(payload.sub), token: raw };
}

function authRateKey_(normalizedName) {
  return 'auth:' + sha256WebSafe_(normalizeNameCore(normalizedName)).slice(0, 32);
}

function assertLoginRateAllowed_(normalizedName) {
  var count = Number(CacheService.getScriptCache().get(authRateKey_(normalizedName)) || 0);
  if (count >= 5) throw apiError_('TOO_MANY_ATTEMPTS', '잠시 후 다시 시도해주세요.');
}

function recordLoginFailure_(normalizedName) {
  var cache = CacheService.getScriptCache();
  var key = authRateKey_(normalizedName);
  var count = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(count), 600);
}

function clearLoginFailures_(normalizedName) {
  CacheService.getScriptCache().remove(authRateKey_(normalizedName));
}

function initializeSecrets() {
  var properties = PropertiesService.getScriptProperties();
  var updates = {};
  if (!properties.getProperty(PROPERTY_KEYS_.TOKEN_SECRET)) updates[PROPERTY_KEYS_.TOKEN_SECRET] = randomSecret_();
  if (!properties.getProperty(PROPERTY_KEYS_.PIN_PEPPER)) updates[PROPERTY_KEYS_.PIN_PEPPER] = randomSecret_();
  if (!properties.getProperty(PROPERTY_KEYS_.SESSION_IDLE_MINUTES)) updates[PROPERTY_KEYS_.SESSION_IDLE_MINUTES] = '30';
  if (!properties.getProperty(PROPERTY_KEYS_.SESSION_MAX_MINUTES)) updates[PROPERTY_KEYS_.SESSION_MAX_MINUTES] = '120';
  if (!properties.getProperty(PROPERTY_KEYS_.AVERAGE_MIN_SUBMISSIONS)) updates[PROPERTY_KEYS_.AVERAGE_MIN_SUBMISSIONS] = '3';
  if (Object.keys(updates).length) properties.setProperties(updates, false);
  SpreadsheetApp.getUi().alert(Object.keys(updates).length ? '누락된 비밀키와 기본 설정을 생성했습니다.' : '기존 비밀키를 유지했습니다. 새로 덮어쓰지 않았습니다.');
}
