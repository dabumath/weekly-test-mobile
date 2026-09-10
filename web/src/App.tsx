import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, apiMode } from './api';
import { ApiError } from './api/apiClient';
import type {
  ExamDetail,
  GradedSubmission,
  HelpRequestInput,
  HelpType,
  MistakeReason,
  OverallReflectionInput,
  ReflectionItem,
  ResultSummary,
  ReviewCategory,
  StudentExamState,
} from './domain/types';
import { clearAnswerDraft, clearDraft, patchDraft, readDraft } from './storage/sessionStorage';

type Screen = 'login' | 'exam' | 'answers' | 'review' | 'reflection' | 'help' | 'overall' | 'result';

const circled = ['', '①', '②', '③', '④', '⑤'];
const wrongLabels: Array<[ReviewCategory, string]> = [
  ['UNKNOWN_WRONG', '몰라서 틀림'],
  ['MISTAKE_WRONG', '실수로 틀림'],
  ['TIME_SHORTAGE_WRONG', '시간 부족'],
];
const correctLabels: Array<[ReviewCategory, string]> = [
  ['SOLVED_CORRECT', '풀어서 맞음'],
  ['LUCKY_CORRECT', '찍어서 맞음'],
];
const mistakeLabels: Array<[MistakeReason | null, string]> = [
  ['CALCULATION', '계산 실수'],
  ['SIGN', '부호 실수'],
  ['CONDITION_MISSED', '조건 누락'],
  ['MISREAD', '문제를 잘못 읽음'],
  ['ANSWER_TRANSCRIPTION', '답 옮겨 적기'],
  ['FORMULA_CONFUSION', '공식·개념 착각'],
  ['NO_REVIEW', '검산하지 않음'],
  ['OTHER', '기타'],
  [null, '원인 선택 안 함'],
];
const helpLabels: Array<[HelpType, string]> = [
  ['CONCEPT_EXPLANATION', '개념 설명이 필요해요'],
  ['TYPE_EXPLANATION', '이 유형을 다시 설명해주세요'],
  ['SIMILAR_PROBLEM', '비슷한 문제를 더 풀고 싶어요'],
  ['OTHER', '기타'],
];
const strengthLabels = ['끝까지 집중했다', '어려운 문제를 넘기고 돌아왔다', '시간 배분이 좋았다', '검산했다', '이전에 틀린 유형을 맞혔다', '풀이를 정확히 작성했다'];
const regretLabels = ['계산 실수가 많았다', '초반 문제에 시간을 많이 썼다', '어려운 문제를 오래 붙잡았다', '검산하지 못했다', '개념이 기억나지 않았다', '문제 조건을 놓쳤다', '찍은 문제가 많았다'];

function messageOf(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return '요청을 처리하지 못했습니다. 인터넷 연결을 확인해주세요.';
}

function go(screen: Screen) {
  window.location.hash = '/' + screen;
}

function useScreen() {
  const parse = () => (window.location.hash.replace(/^#\/?/, '') || 'login') as Screen;
  const [screen, setScreen] = useState<Screen>(parse);
  useEffect(() => {
    const listener = () => setScreen(parse());
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);
  return screen;
}

function Header({ title, eyebrow }: { title: string; eyebrow?: string }) {
  return (
    <header className="screen-header">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
    </header>
  );
}

function ChoiceChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={'choice-chip' + (selected ? ' selected' : '')} aria-pressed={selected} onClick={onClick}>{children}</button>;
}

export function App() {
  const screen = useScreen();
  const draft = useMemo(readDraft, []);
  const [sessionToken, setSessionToken] = useState(draft.sessionToken || '');
  const [displayName, setDisplayName] = useState(draft.displayName || '');
  const [className, setClassName] = useState(draft.className || '');
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [submission, setSubmission] = useState<GradedSubmission | null>(null);
  const [result, setResult] = useState<ResultSummary | null>(null);
  const [answers, setAnswers] = useState<Record<number, number | null>>(draft.answers || {});
  const [reflections, setReflections] = useState<Record<number, ReflectionItem>>(
    () => Object.fromEntries(Object.entries(draft.reflections || {}).map(([key, value]) => [Number(key), { questionNo: Number(key), category: value.category as ReviewCategory, mistakeReason: value.mistakeReason as MistakeReason | null | undefined }])),
  );
  const [help, setHelp] = useState<Record<number, HelpRequestInput>>(
    () => Object.fromEntries(Object.entries(draft.help || {}).map(([key, value]) => [Number(key), { questionNo: Number(key), helpTypes: value.helpTypes as HelpType[], note: value.note }])),
  );
  const [overall, setOverall] = useState<OverallReflectionInput>(() => draft.overall || { strengths: [], regrets: [], nextAction: '', freeNote: '' });
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mistakeQuestion, setMistakeQuestion] = useState<number | null>(null);
  const [canEditReflection, setCanEditReflection] = useState(false);

  function initializeReflection(graded: GradedSubmission, savedItems?: ReflectionItem[]) {
    const initial: Record<number, ReflectionItem> = {};
    for (const q of graded.questions) {
      if (q.isCorrect) initial[q.questionNo] = { questionNo: q.questionNo, category: 'SOLVED_CORRECT' };
    }
    const draftItems = savedItems || Object.values(reflections);
    for (const item of draftItems) initial[item.questionNo] = item;
    setReflections(initial);
    patchDraft({ reflections: initial });
  }

  async function loadExamState(token: string, examId: string) {
    setBusy(true);
    setError('');
    try {
      const state: StudentExamState = await api.getStudentExamState(token, examId);
      setExam(state.exam);
      if (state.state === 'NOT_STARTED') {
        go('exam');
      } else if (state.state === 'ANSWER_SUBMITTED') {
        setSubmission(state.submission);
        initializeReflection(state.submission);
        go('reflection');
      } else {
        setSubmission(state.submission);
        setResult(state.result);
        initializeReflection(state.submission, state.savedReflection.items);
        setOverall(state.savedReflection.overall);
        setHelp(Object.fromEntries(state.savedReflection.helpRequests.map((item) => [item.questionNo, item])));
        setCanEditReflection(state.canEditReflection);
        go('result');
      }
    } catch (e) {
      setError(messageOf(e));
      clearDraft();
      setSessionToken('');
      go('login');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (draft.sessionToken && draft.examId && !exam) void loadExamState(draft.sessionToken, draft.examId);
    // Initial session restoration only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const saved = readDraft();
      if (saved.lastActivityAt && Date.now() - saved.lastActivityAt > 30 * 60 * 1000) {
        clearDraft();
        setSessionToken('');
        setError('로그인이 만료되어 임시 데이터를 지웠습니다. 다시 로그인해주세요.');
        go('login');
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  async function login(name: string, pin: string) {
    setBusy(true);
    setError('');
    try {
      const data = await api.login(name, pin);
      setSessionToken(data.sessionToken);
      setDisplayName(data.student.displayName);
      setClassName(data.student.className);
      if (!data.activeExams.length) {
        setError('현재 응시할 수 있는 시험이 없습니다.');
        return;
      }
      const selected = data.activeExams[0];
      patchDraft({ sessionToken: data.sessionToken, displayName: data.student.displayName, className: data.student.className, examId: selected.examId });
      const detail = await api.getExam(data.sessionToken, selected.examId);
      setExam(detail);
      await loadExamState(data.sessionToken, selected.examId);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswers() {
    if (!exam) return;
    setBusy(true);
    setError('');
    try {
      const clientRequestId = crypto.randomUUID();
      const payload = exam.questions.map((q) => ({ questionNo: q.questionNo, answer: answers[q.questionNo] ?? null }));
      const graded = await api.submitAnswers(sessionToken, exam.examId, clientRequestId, payload);
      setSubmission(graded);
      initializeReflection(graded);
      clearAnswerDraft();
      setCurrent(0);
      go('reflection');
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  function advanceReflection(questionNo: number) {
    if (!submission) return;
    const index = submission.questions.findIndex((q) => q.questionNo === questionNo);
    if (index < submission.questions.length - 1) setCurrent(index + 1);
    else go('help');
  }

  function chooseReflection(questionNo: number, category: ReviewCategory) {
    const next = { ...reflections, [questionNo]: { questionNo, category } };
    setReflections(next);
    patchDraft({ reflections: next });
    if (category === 'MISTAKE_WRONG') setMistakeQuestion(questionNo);
    else advanceReflection(questionNo);
  }

  function chooseMistakeReason(reason: MistakeReason | null) {
    if (mistakeQuestion === null) return;
    const next = {
      ...reflections,
      [mistakeQuestion]: { ...reflections[mistakeQuestion], mistakeReason: reason },
    };
    setReflections(next);
    patchDraft({ reflections: next });
    const done = mistakeQuestion;
    setMistakeQuestion(null);
    advanceReflection(done);
  }

  async function submitFinalReflection() {
    if (!submission) return;
    setBusy(true);
    setError('');
    try {
      const helpRequests = Object.values(help).filter((item) => item.helpTypes.length);
      const data = await api.submitReflection(sessionToken, submission.submissionId, Object.values(reflections), overall, helpRequests);
      setResult(data);
      setCanEditReflection(true);
      patchDraft({ reflections, help, overall });
      go('result');
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    clearDraft();
    setSessionToken('');
    setExam(null);
    setSubmission(null);
    setResult(null);
    setAnswers({});
    setReflections({});
    setHelp({});
    setOverall({ strengths: [], regrets: [], nextAction: '', freeNote: '' });
    setCanEditReflection(false);
    go('login');
  }

  if (screen === 'login' || !sessionToken) return <LoginPage onLogin={login} error={error} busy={busy} />;
  if (busy && !exam) return <main className="screen center"><div className="spinner" /><p>불러오는 중…</p></main>;
  if (!exam) return <main className="screen center"><p>{error || '시험 정보를 불러오지 못했습니다.'}</p><button className="primary" onClick={logout}>다시 로그인</button></main>;

  if (screen === 'exam') {
    return (
      <main className="screen">
        <Header eyebrow={`${displayName} · ${className}반`} title={exam.title} />
        <section className="hero-card">
          <div><strong>{exam.questionCount}</strong><span>문항</span></div>
          <div><strong>{exam.totalScore}</strong><span>점</span></div>
          <div><strong>{exam.choiceCount}</strong><span>지선다</span></div>
        </section>
        <p className="body-copy">종이 답안을 입력한 뒤, 내가 풀었던 과정을 솔직하게 표시해주세요.</p>
        <div className="bottom-actions"><button className="primary" onClick={() => go('answers')}>답안 입력 시작</button></div>
      </main>
    );
  }

  if (screen === 'answers') {
    const q = exam.questions[current];
    const completed = Object.values(answers).filter((v) => v != null).length;
    const selectAnswer = (value: number | null) => {
      const next = { ...answers, [q.questionNo]: value };
      setAnswers(next);
      patchDraft({ answers: next });
      if (value !== null) {
        const later = exam.questions.findIndex((item, index) => index > current && next[item.questionNo] == null);
        if (later >= 0) setCurrent(later);
      }
    };
    return (
      <main className="screen answer-screen">
        <div key={`answer-${q.questionNo}`} className="question-transition answer-question">
          <Header eyebrow={exam.title} title={`${q.questionNo}번`} />
          <div className="answer-status"><span>{q.points}점</span><span>{completed}/{exam.questionCount} 입력</span><button className="text-button" onClick={() => go('review')}>전체 답안</button></div>
          <section className="answer-focus" aria-live="polite">
            <p>선택한 답</p>
            <strong>{answers[q.questionNo] ? circled[answers[q.questionNo]!] : '—'}</strong>
          </section>
          <nav className="step-nav" aria-label="문항 이동">
            <button disabled={current === 0} onClick={() => setCurrent((v) => Math.max(0, v - 1))}>이전</button>
            <button disabled={current === exam.questions.length - 1} onClick={() => setCurrent((v) => Math.min(exam.questions.length - 1, v + 1))}>다음</button>
          </nav>
        </div>
        <div className="answer-pad" aria-label="답안 선택">
          {[1,2,3,4,5].slice(0, exam.choiceCount).map((value) => <button key={value} className={answers[q.questionNo] === value ? 'selected' : ''} aria-label={`${value}번 선택`} onClick={() => selectAnswer(value)}>{circled[value]}</button>)}
          <button className="unanswered" onClick={() => selectAnswer(null)}>미응답</button>
        </div>
      </main>
    );
  }

  if (screen === 'review') {
    const missing = exam.questions.filter((q) => answers[q.questionNo] == null).length;
    return (
      <main className="screen">
        <Header eyebrow={exam.title} title="전체 답안" />
        <p className="body-copy">{missing ? `미응답 ${missing}문항이 있습니다. 미응답도 오답으로 제출할 수 있습니다.` : '모든 답안을 입력했습니다.'}</p>
        <section className="answer-list">
          {exam.questions.map((q, index) => (
            <button key={q.questionNo} onClick={() => { setCurrent(index); go('answers'); }}>
              <span className="question-number">{q.questionNo}</span>
              <span className="answer-circle">{answers[q.questionNo] ? circled[answers[q.questionNo]!] : '—'}</span>
              <span className={answers[q.questionNo] ? 'done-label' : 'empty-label'}>{answers[q.questionNo] ? '입력 완료' : '미응답'}</span>
            </button>
          ))}
        </section>
        {error && <p className="error">{error}</p>}
        <div className="bottom-actions stacked">
          <button className="secondary" onClick={() => go('answers')}>답안 수정</button>
          <button className="primary" disabled={busy} onClick={() => {
            if (window.confirm('답안을 최종 제출하면 답안은 더 이상 변경할 수 없습니다.\n복기 내용은 이후에도 수정할 수 있습니다.\n제출하시겠습니까?')) void submitAnswers();
          }}>답안 최종 제출</button>
        </div>
      </main>
    );
  }

  if (screen === 'reflection' && submission) {
    const q = submission.questions[current];
    const options = q.isCorrect ? correctLabels : wrongLabels;
    return (
      <main className="screen reflection-screen">
        <div key={`reflection-${q.questionNo}`} className="question-transition">
          <Header eyebrow={`${current + 1} / ${submission.questions.length}`} title={`${q.questionNo}번 · ${q.isCorrect ? '정답' : '오답'}`} />
          <section className={q.isCorrect ? 'result-strip correct' : 'result-strip wrong'}>
            <span>내 답 {q.studentAnswer ? circled[q.studentAnswer] : '미응답'}</span>
            <span>정답 {circled[q.correctAnswer]}</span>
            <strong>{q.points}점</strong>
          </section>
          <h2>어떻게 풀었나요?</h2>
          <div className="reflection-options">
            {options.map(([value, label]) => <ChoiceChip key={value} selected={reflections[q.questionNo]?.category === value} onClick={() => chooseReflection(q.questionNo, value)}>{label}</ChoiceChip>)}
          </div>
          <p className="hint">선택하면 다음 문항으로 넘어갑니다.</p>
          <nav className="step-nav"><button disabled={current === 0} onClick={() => setCurrent((v) => Math.max(0, v - 1))}>이전 문항</button><button onClick={() => current === submission.questions.length - 1 ? go('help') : setCurrent((v) => v + 1)}>건너뛰기</button></nav>
        </div>
        {mistakeQuestion !== null && (
          <div className="sheet-backdrop" role="presentation">
            <section className="reason-sheet" role="dialog" aria-modal="true" aria-label="실수 원인 선택">
              <div className="sheet-handle" />
              <h2>실수 원인이 있었나요?</h2>
              <p>선택 사항입니다.</p>
              <div className="reason-grid">{mistakeLabels.map(([value, label]) => <button key={value || 'none'} onClick={() => chooseMistakeReason(value)}>{label}</button>)}</div>
            </section>
          </div>
        )}
      </main>
    );
  }

  if (screen === 'help' && submission) {
    const candidates = submission.questions.filter((q) => reflections[q.questionNo]?.category !== 'SOLVED_CORRECT');
    const toggleQuestion = (questionNo: number) => {
      const next = { ...help };
      if (next[questionNo]) delete next[questionNo];
      else next[questionNo] = { questionNo, helpTypes: [] };
      setHelp(next);
      patchDraft({ help: next });
    };
    const toggleType = (questionNo: number, type: HelpType) => {
      const item = help[questionNo] || { questionNo, helpTypes: [] };
      const helpTypes = item.helpTypes.includes(type) ? item.helpTypes.filter((v) => v !== type) : [...item.helpTypes, type];
      const next = { ...help, [questionNo]: { ...item, helpTypes } };
      setHelp(next);
      patchDraft({ help: next });
    };
    return (
      <main className="screen">
        <Header eyebrow="복기 완료 후 선택" title="어떤 문제를 도와줄까요?" />
        <p className="body-copy">도움이 필요한 문항만 선택하세요. 요청이 없으면 바로 넘어가도 됩니다.</p>
        <section className="help-list">
          {candidates.map((q) => (
            <article key={q.questionNo}>
              <button className={'help-question' + (help[q.questionNo] ? ' selected' : '')} onClick={() => toggleQuestion(q.questionNo)}>
                <span>{q.questionNo}번</span><span>{reflections[q.questionNo]?.category === 'LUCKY_CORRECT' ? '찍어서 맞음' : '다시 보기 필요'}</span>
              </button>
              {help[q.questionNo] && <div className="help-options">{helpLabels.map(([value,label]) => <ChoiceChip key={value} selected={help[q.questionNo].helpTypes.includes(value)} onClick={() => toggleType(q.questionNo, value)}>{label}</ChoiceChip>)}</div>}
            </article>
          ))}
        </section>
        <div className="bottom-actions"><button className="primary" onClick={() => go('overall')}>{Object.keys(help).length ? '선택 완료' : '요청 없이 넘어가기'}</button></div>
      </main>
    );
  }

  if (screen === 'overall') {
    const toggle = (field: 'strengths' | 'regrets', value: string) => {
      const list = overall[field];
      const next = { ...overall, [field]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
      setOverall(next);
      patchDraft({ overall: next });
    };
    return (
      <main className="screen">
        <Header eyebrow={exam.title} title="이번 시험 돌아보기" />
        <h2>잘한 점</h2>
        <div className="tag-wrap">{strengthLabels.map((label) => <ChoiceChip key={label} selected={overall.strengths.includes(label)} onClick={() => toggle('strengths', label)}>{label}</ChoiceChip>)}</div>
        <h2>아쉬운 점</h2>
        <div className="tag-wrap">{regretLabels.map((label) => <ChoiceChip key={label} selected={overall.regrets.includes(label)} onClick={() => toggle('regrets', label)}>{label}</ChoiceChip>)}</div>
        <label className="field"><span>다음 시험에서 지킬 행동 <b>필수</b></span><textarea maxLength={200} value={overall.nextAction} onChange={(e) => { const next = { ...overall, nextAction: e.target.value }; setOverall(next); patchDraft({ overall: next }); }} placeholder="예: 마지막 5분은 검산에 사용하겠다." /></label>
        <label className="field"><span>메모 <small>선택</small></span><textarea maxLength={500} value={overall.freeNote || ''} onChange={(e) => { const next = { ...overall, freeNote: e.target.value }; setOverall(next); patchDraft({ overall: next }); }} placeholder="남기고 싶은 내용을 적어주세요." /></label>
        {error && <p className="error">{error}</p>}
        <div className="bottom-actions"><button className="primary" disabled={busy || !overall.nextAction.trim()} onClick={() => void submitFinalReflection()}>{busy ? '저장 중…' : '복기 최종 제출'}</button></div>
      </main>
    );
  }

  if (screen === 'result' && result) {
    return (
      <main className="screen result-screen">
        <Header eyebrow={exam.title} title="복기를 마쳤어요" />
        <section className="score-card"><p>시험지상 점수</p><strong>{result.rawScore}<small> / {result.totalScore}</small></strong></section>
        <section className="score-grid">
          <div><span>찍맞 차감</span><strong>−{result.luckyDeduction}</strong></div>
          <div><span>실수 회복</span><strong>+{result.mistakeRecovery}</strong></div>
          <div className="wide"><span>보정 실력 점수</span><strong>{result.adjustedScore}</strong></div>
        </section>
        <section className="count-list">
          <p><span>풀어서 맞음</span><b>{result.counts.SOLVED_CORRECT}</b></p>
          <p><span>찍어서 맞음</span><b>{result.counts.LUCKY_CORRECT}</b></p>
          <p><span>몰라서 틀림</span><b>{result.counts.UNKNOWN_WRONG}</b></p>
          <p><span>실수로 틀림</span><b>{result.counts.MISTAKE_WRONG}</b></p>
          <p><span>시간 부족</span><b>{result.counts.TIME_SHORTAGE_WRONG}</b></p>
          <p><span>도움 요청 문항</span><b>{result.helpRequestCount}</b></p>
        </section>
        <section className="average-card">
          <h2>{result.averageLabel}</h2>
          <p>시험지상 평균 <b>{result.rawAverage == null ? '평균 집계 중' : result.rawAverage.toFixed(1)}</b><small>{result.rawAverageCount}명 제출</small></p>
          <p>보정 평균 <b>{result.adjustedAverage == null ? '평균 집계 중' : result.adjustedAverage.toFixed(1)}</b><small>{result.adjustedAverageCount}명 복기</small></p>
        </section>
        <div className={'bottom-actions' + (canEditReflection ? ' stacked' : '')}>
          {canEditReflection && <button className="secondary" onClick={() => { setCurrent(0); go('reflection'); }}>복기 수정</button>}
          <button className="secondary" onClick={() => { clearDraft(); logout(); }}>종료</button>
        </div>
      </main>
    );
  }

  return <main className="screen center"><p>화면을 불러오는 중입니다.</p></main>;
}

function LoginPage({ onLogin, error, busy }: { onLogin: (name: string, pin: string) => Promise<void>; error: string; busy: boolean }) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  return (
    <main className="screen login-screen">
      <Header eyebrow="주간고사" title="답안을 입력해볼까요?" />
      <p className="body-copy">이름과 확인번호를 입력하면 이번 주 시험을 확인할 수 있어요.</p>
      <form onSubmit={(e) => { e.preventDefault(); void onLogin(name, pin).finally(() => setPin('')); }}>
        <label className="field"><span>이름</span><input autoComplete="name" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} placeholder="학생 이름" /></label>
        <label className="field"><span>확인번호 4자리</span><input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{4}" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0,4))} placeholder="••••" /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy || !name.trim() || pin.length !== 4}>{busy ? '확인 중…' : '로그인'}</button>
      </form>
      <p className="legal-copy">이름과 확인번호는 학원 내부 학생을 구분하기 위한 간단한 확인 절차입니다.<br />강한 본인 인증 수단은 아닙니다.</p>
      {apiMode === 'mock' && <p className="mock-note">목업 모드 · 확인번호 1234</p>}
    </main>
  );
}
