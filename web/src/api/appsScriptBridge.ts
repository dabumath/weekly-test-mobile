import type { ApiClient } from './apiClient';
import { ApiError } from './apiClient';
import type {
  ExamDetail,
  GradedSubmission,
  HelpRequestInput,
  LoginResult,
  OverallReflectionInput,
  ReflectionItem,
  ResultSummary,
  StudentExamState,
} from '../domain/types';

const CHANNEL = 'weekly-test-bridge-v1';
const WRITE_ACTIONS = new Set(['SUBMIT_ANSWERS', 'SUBMIT_REFLECTION']);

interface BridgeResponse {
  channel: typeof CHANNEL;
  type?: 'READY';
  requestId?: string;
  bridgeNonce: string;
  ok?: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}

function isAppsScriptOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'script.google.com' || url.hostname.endsWith('.googleusercontent.com'))
    );
  } catch {
    return false;
  }
}

export function isValidBridgeResponse(value: unknown): value is BridgeResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<BridgeResponse>;
  return v.channel === CHANNEL && typeof v.bridgeNonce === 'string';
}

export class AppsScriptBridgeClient implements ApiClient {
  private iframe: HTMLIFrameElement;
  private nonce = crypto.randomUUID().replaceAll('-', '');
  private trustedSource: WindowProxy | null = null;
  private trustedOrigin = '';
  private ready: Promise<void>;
  private pending = new Map<
    string,
    { resolve: (data: unknown) => void; reject: (error: Error) => void }
  >();

  constructor(private readonly webAppUrl: string) {
    this.iframe = document.createElement('iframe');
    this.iframe.title = '주간고사 보안 연결';
    this.iframe.className = 'bridge-frame';
    const url = new URL(webAppUrl);
    url.searchParams.set('bridge_nonce', this.nonce);
    this.iframe.src = url.toString();
    document.body.appendChild(this.iframe);

    this.ready = new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new ApiError('BRIDGE_TIMEOUT', '서버 연결 시간이 초과되었습니다.')), 20_000);
      const onMessage = (event: MessageEvent) => {
        if (event.source !== this.iframe.contentWindow || !isAppsScriptOrigin(event.origin)) return;
        if (!isValidBridgeResponse(event.data) || event.data.type !== 'READY' || event.data.bridgeNonce !== this.nonce) return;
        this.trustedSource = event.source as WindowProxy;
        this.trustedOrigin = event.origin;
        window.clearTimeout(timer);
        resolve();
      };
      window.addEventListener('message', onMessage);
    });
    window.addEventListener('message', (event) => this.receive(event));
  }

  private receive(event: MessageEvent) {
    if (
      !this.trustedSource ||
      event.source !== this.trustedSource ||
      event.origin !== this.trustedOrigin ||
      !isValidBridgeResponse(event.data) ||
      event.data.bridgeNonce !== this.nonce ||
      !event.data.requestId
    ) return;
    const pending = this.pending.get(event.data.requestId);
    if (!pending) return;
    this.pending.delete(event.data.requestId);
    if (event.data.ok) pending.resolve(event.data.data);
    else pending.reject(new ApiError(event.data.error?.code || 'SERVER_ERROR', event.data.error?.message || '요청을 처리하지 못했습니다.'));
  }

  private async call<T>(action: string, payload: unknown, requestId: string = crypto.randomUUID(), attempt = 0): Promise<T> {
    await this.ready;
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        if (WRITE_ACTIONS.has(action) && attempt === 0) {
          void this.call<T>(action, payload, requestId, 1).then(resolve, reject);
        } else {
          reject(new ApiError('REQUEST_TIMEOUT', '요청 시간이 초과되었습니다. 인터넷 연결을 확인해주세요.'));
        }
      }, 20_000);
      this.pending.set(requestId, {
        resolve: (data) => {
          window.clearTimeout(timer);
          resolve(data as T);
        },
        reject: (error) => {
          window.clearTimeout(timer);
          reject(error);
        },
      });
      this.trustedSource?.postMessage({ channel: CHANNEL, requestId, bridgeNonce: this.nonce, action, payload }, this.trustedOrigin);
    });
  }

  login(name: string, pin: string) {
    return this.call<LoginResult>('LOGIN', { name, pin });
  }
  getExam(sessionToken: string, examId: string) {
    return this.call<ExamDetail>('GET_EXAM', { sessionToken, examId });
  }
  getStudentExamState(sessionToken: string, examId: string) {
    return this.call<StudentExamState>('GET_STUDENT_EXAM_STATE', { sessionToken, examId });
  }
  submitAnswers(sessionToken: string, examId: string, clientRequestId: string, answers: Array<{ questionNo: number; answer: number | null }>) {
    return this.call<GradedSubmission>('SUBMIT_ANSWERS', { sessionToken, examId, clientRequestId, answers }, clientRequestId);
  }
  submitReflection(sessionToken: string, submissionId: string, items: ReflectionItem[], overall: OverallReflectionInput, helpRequests: HelpRequestInput[]) {
    return this.call<ResultSummary>('SUBMIT_REFLECTION', { sessionToken, submissionId, items, overall, helpRequests });
  }
  getResult(sessionToken: string, submissionId: string) {
    return this.call<ResultSummary>('GET_RESULT', { sessionToken, submissionId });
  }
}
