# 배포 안내

실제 서비스 연결에는 아래 네 단계가 필요합니다. 저장소에는 실데이터 ID나 비밀키를 넣지 않습니다.

## 1. Apps Script 붙이기

운영 스프레드시트에서 `확장 프로그램 > Apps Script`를 엽니다. `apps-script/`의 `.gs` 파일과 `Bridge.html`, `appsscript.json` 내용을 같은 이름의 파일로 옮깁니다.

Apps Script 편집기에서 `onOpen`을 한 번 실행하거나 시트를 새로고침하면 `주간고사 시스템` 메뉴가 나타납니다.

## 2. 운영 설정

메뉴를 순서대로 실행합니다.

1. `비밀키 준비`: 없는 키만 생성하며 기존 키는 덮어쓰지 않습니다.
2. `현재 시트 연결`: 현재 시트 ID를 Script Properties에 저장합니다.
3. `웹사이트 주소 연결`: GitHub Pages 주소의 origin만 입력합니다. 예: `https://example.github.io`
4. `학생 PIN 해시 생성`: 원본 학생 명단 링크를 입력합니다. 담당이 다부인 대상 행만 확인해 해시를 만듭니다.
5. `시험 데이터 검증`: 시험 수, 학생 수, PIN 준비 수, 문항 연속성과 배점 합계를 확인합니다.

`원본 시트=수동 테스트`로 표시된 파일럿 계정은 먼저 `테스트 계정 PIN 설정` 메뉴에서 이름과 숫자 4자리를 입력합니다. 입력한 평문은 저장하지 않고 해시만 학생 시트에 기록합니다.

원본 명단 ID를 나중에 바꾸려면 Apps Script의 `프로젝트 설정 > 스크립트 속성`에서 `ROSTER_SPREADSHEET_ID`만 바꿉니다.

## 3. Apps Script 웹앱 배포

`배포 > 새 배포 > 웹 앱`에서 다음처럼 설정합니다.

- 실행 사용자: 나
- 액세스 권한: 링크가 있는 모든 사용자

웹앱 URL을 복사합니다. 운영 시트는 계속 비공개이며, 학생은 시트가 아니라 제한된 서버 함수만 호출합니다. 코드를 바꾼 뒤에는 새 버전으로 다시 배포해야 합니다.

## 4. 학생용 웹앱 빌드

로컬에서는 `web/.env.local`을 만들고 다음 값을 설정합니다.

```text
VITE_USE_MOCK=false
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/배포_ID/exec
```

```bash
cd web
npm install
npm test
npm run typecheck
npm run build
```

GitHub Pages 자동 배포를 쓰면 저장소 Variables에 `VITE_APPS_SCRIPT_URL`을 추가한 뒤 워크플로를 실행합니다. 첫 파일럿 전에는 `시험` 시트의 대상 시험만 `공개`로 바꾸고, 다른 시험은 `준비중`으로 둡니다.

## 배포 전 중단 조건

- PIN 설정 수가 사용 학생 수와 다름
- 같은 이름+확인번호 조합이 중복됨
- 문항 번호가 1부터 연속되지 않음
- 문항 배점 합계와 시험 총점이 다름
- 허용 웹사이트 origin이 실제 GitHub Pages origin과 다름
- 테스트 학생의 답안 또는 복기 제출이 중복 행을 만듦
