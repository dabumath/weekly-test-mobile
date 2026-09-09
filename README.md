# 주간고사 모바일 채점·복기

학생은 모바일에서 객관식 답안을 최종 제출하고, 서버 채점 결과를 바탕으로 복기를 최종 제출합니다.

## 저장 원칙

- 답안 입력 중 내용과 복기 초안은 브라우저 `sessionStorage`에만 둡니다.
- Google Sheets에는 답안 최종 제출과 복기 최종 제출 시점에만 기록합니다.
- 정답과 점수는 Apps Script가 비공개 시트의 문항 정보를 읽어 다시 계산합니다.
- 학생 명단, PIN, 시트 ID, 비밀키는 GitHub에 올리지 않습니다.
- 이름과 확인번호 4자리는 강한 본인 인증이 아니라 학원 내부 학생을 구분하기 위한 간단한 확인 절차입니다.

## 로컬 실행

```bash
cd web
npm install
npm run dev
```

Apps Script 연결 전에는 Mock API가 동작합니다. 자세한 배포 순서는 [배포 안내](docs/DEPLOYMENT_KO.md)를 확인하세요.

## 폴더

- `web/`: 학생용 React 모바일 웹앱
- `apps-script/`: 비공개 시트에 연결할 Apps Script 서버와 iframe 브리지
- `docs/`: 구조, 시트 스키마, 보안, 배포, 시험 시나리오

## 검증

```bash
cd web
npm test
npm run typecheck
npm run build
cd ..
node --test apps-script/tests/core.test.mjs
```

실제 배포 전에는 반드시 [테스트 시나리오](docs/TEST_SCENARIOS.md)의 3~5명 파일럿을 진행합니다.
