# Play Store 출시 체크리스트

## 자동으로 끝난 것

- [x] `app.json`: Android package id `com.jihoonlee91.rowingtracker`, 위치 권한 설명 문구
- [x] `eas.json`: development/preview/production 빌드 프로필, production은 AAB + versionCode 자동 증가
- [x] 개인정보처리방침 페이지 (`docs/privacy-policy.html`) → GitHub Pages 배포 워크플로 추가
- [x] 앱 3개 화면 구현 및 검증 (트래커 / 대회 / 훈련계획)

## 사용자가 직접 해야 하는 것 (계정/결제/심사 관련이라 대행 불가)

1. **Google Play 개발자 계정 생성** — https://play.google.com/console/signup (1회 $25)
2. **Expo/EAS 계정 로그인**: 로컬에서 `npx eas-cli login` (대화형 인증이라 이 세션에서 대신 할 수 없음)
3. **EAS 프로젝트 연결**: `cd rowing-tracker && npx eas-cli init` → `app.json`에 `extra.eas.projectId` 자동 기록됨
4. **프로덕션 빌드**: `npx eas-cli build --platform android --profile production`
   - 최초 빌드 시 Android 키스토어를 EAS가 자동 생성/관리해줌 (권장)
5. **개인정보처리방침 URL 확정**: GitHub Pages 활성화 후 (Settings → Pages → Source: GitHub Actions)
   `https://jihoonlee91.github.io/rowing-tracker/privacy-policy.html`
6. **Play Console 스토어 등록정보 입력**:
   - 카테고리: 건강/피트니스
   - 콘텐츠 등급 설문 작성
   - 데이터 보안 섹션: "위치정보는 기기 내에서만 사용, 서버 전송 없음" 체크
   - 개인정보처리방침 URL 등록 (5번 URL)
7. **스토어 등록정보(초안)** — 아래 텍스트 그대로 사용 가능:

   **앱 이름**: 조정 트래커 (Rowing Tracker)

   **짧은 설명 (80자 이내)**:
   > GPS로 조정·카누 운동을 기록하고, 대회 일정과 주간 훈련 계획까지 한 번에

   **전체 설명**:
   > 조정 트래커는 조정(로잉)·카누 운동을 하는 사람을 위한 심플한 운동 기록 앱입니다.
   >
   > - GPS 기반 실시간 거리·페이스(500m 기준)·시간 추적
   > - 스트로크 탭 카운터로 분당 스트로크율(spm) 확인
   > - 국내외 조정·카누 대회 일정을 한곳에서 확인 (race-hub 연동)
   > - 요일별 주간 훈련 계획 관리, 완료 체크
   >
   > 계정 가입 없이 바로 사용할 수 있고, 위치 정보는 기기 안에서만 처리되며 서버로 전송되지 않습니다.

8. **스크린샷 준비**: `npx eas-cli build --profile preview` 로 만든 APK를 실기기/에뮬레이터에 설치 후 각 탭 캡처 (최소 2장, 권장 4~8장)
9. **앱 아이콘**: 현재 `assets/icon.png`는 Expo 기본 플레이스홀더 — 정식 출시 전 실제 아이콘 디자인으로 교체 필요
10. **제출**: `npx eas-cli submit --platform android --profile production` (Play Console API 연동 필요, 최초 1회 서비스 계정 키 설정)

## 참고

- EAS 빌드/제출 공식 가이드: https://docs.expo.dev/submit/android/
