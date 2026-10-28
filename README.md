# rowing-tracker

조정(로잉) 기록 앱. Expo(SDK 57) + Expo Router, React Native.

- **트래커**: GPS로 거리·시간·현재/평균 페이스(/500m, 콘셉트2처럼 `m:ss.t`), 스트로크 탭으로 스트로크 수·spm. 일시정지 중 이동한 거리는 넣지 않음.
- **기록**: 트래커에서 운동을 마치면 자동 저장(30초·50m 미만은 제외). 에르고(콘셉트2) 기록을 거리·시간(`7:30.5`)·spm·날짜로 입력하면 페이스와 와트(2.80/(초/m)³) 계산. 이번 주(월요일부터) 거리·시간 합계와 최근 8주 주별 거리 막대 그래프, 에르고 표준 거리(500m·1k·2k·5k·6k·10k) 최고 기록(0.1초까지), 같은 표준 거리 기록이 2개 이상이면 /500m 페이스 추이 점 그래프(거리 칩으로 선택, 최근 12회). 거리는 `2000`·`2,000`·`2k`로, spm은 10~60. 기기에 저장(AsyncStorage `rowing-tracker:workouts:v1`). 맨 아래 **백업 · 가져오기**: CSV 내보내기(웹은 파일 다운로드, 폰은 공유, GPS 500m 스플릿은 `splits_500m` 열에 `150.2 148.9`처럼), 이 앱 CSV나 콘셉트2 로그북(log.concept2.com) CSV를 붙여넣어 가져오기(RowErg만, 같은 기록은 건너뜀).
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
