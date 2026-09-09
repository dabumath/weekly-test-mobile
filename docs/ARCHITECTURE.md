# 연결 구조

```text
학생 iPhone
  -> GitHub Pages의 React 웹앱
  -> 숨김 iframe의 Apps Script 브리지
  -> Apps Script 서버 함수
  -> 비공개 Google Sheets
```

## 책임 분리

- React: 입력 화면, 화면 이동, 제출 전 임시 데이터만 담당합니다.
- `sessionStorage`: 답안 입력 중 내용과 복기 초안을 탭이 열린 동안만 보관합니다.
- iframe 브리지: 허용된 웹사이트 origin, iframe 창, nonce, 요청 ID가 모두 맞는 메시지만 전달합니다.
- Apps Script: 로그인, 접근 권한, 시험 공개 상태, 입력값, 중복 제출을 검증하고 서버 채점합니다.
- Google Sheets: 운영 설정과 최종 제출 데이터만 보관합니다.

## 서버 액션

| 액션 | 용도 | 시트 쓰기 |
|---|---|---|
| `LOGIN` | 학생 확인, 세션 발급, 공개 시험 조회 | 없음 |
| `GET_EXAM` | 문항 수·배점 조회 | 없음 |
| `GET_STUDENT_EXAM_STATE` | 제출 및 복기 상태 복원 | 없음 |
| `SUBMIT_ANSWERS` | 시트 정답으로 재채점하고 답안 잠금 | `제출`, `제출문항` |
| `SUBMIT_REFLECTION` | 문항별·전체 복기와 도움 요청 최종 반영 | `제출문항`, `전체복기`, `도움요청`, `제출` |
| `GET_RESULT` | 본인 결과와 최소 인원 충족 평균 조회 | 없음 |

입력 중 자동 저장 API는 없습니다. 네트워크 재시도는 동일 요청 ID를 재사용하며, 서버가 중복 행을 만들지 않도록 처리합니다.
