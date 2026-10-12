# rowing-tracker

조정(로잉) 기록 앱. Expo(SDK 57) + Expo Router, React Native.

- **트래커**: GPS로 거리·시간·현재/평균 페이스(/500m, 콘셉트2처럼 `m:ss.t`), 스트로크 탭으로 스트로크 수·spm. 일시정지 중 이동한 거리는 넣지 않음.
- **대회**: race-hub API(`https://race-hub-plum.vercel.app/api/events?sport=rowing`)의 조정 대회 목록.
- **훈련계획**: 요일별 세션(지속주·인터벌·기술·에르고·휴식), 기기에 저장(AsyncStorage `rowing-tracker:training-plan:v1`).

## 실행

```bash
npm ci
npx expo start
```

`.npmrc`의 `legacy-peer-deps=true`로 설치한다(expo-router 선택 peer 버전 충돌 회피). 패키지 추가는 `npx expo install <pkg>`.

## 검사

```bash
npm run typecheck
npm test
npm run build:web
```

`npm test`는 Node 24 내장 테스트 러너(`tests/*.test.mjs`, `.ts`를 바로 import).

## 배포

- GitHub Pages(`.github/workflows/deploy-pages.yml`): master에 `docs/` 변경이 push되면 `docs/`(개인정보처리방침 등)를 배포. 앱 웹 빌드는 배포하지 않음.
- 스토어 제출 준비는 `docs/PLAY_STORE.md`. EAS 빌드·제출은 사람이 직접.
