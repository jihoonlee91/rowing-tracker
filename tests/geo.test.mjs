// node --test tests/ (Node 22.18+/24: .ts 타입 제거 내장)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accumulateTrack, advanceSplits, formatDuration, formatPacePer500m, splitDurations } from '../src/lib/geo.ts';

test('페이스 /500m: m:ss.t, 반올림해도 1:60이 나오지 않음', () => {
  assert.equal(formatPacePer500m(500 / 120), '2:00.0');
  assert.equal(formatPacePer500m(500 / 105.3), '1:45.3');
  assert.equal(formatPacePer500m(500 / 119.96), '2:00.0');
  assert.equal(formatPacePer500m(500 / 59.97), '1:00.0');
  assert.equal(formatPacePer500m(0), '--:--');
  assert.equal(formatPacePer500m(-1), '--:--');
  assert.equal(formatPacePer500m(NaN), '--:--');
  assert.equal(formatPacePer500m(0.1), '--:--'); // 500m에 5000초 → 정지로 봄
});

test('시간 표기', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(65.9), '01:05');
  assert.equal(formatDuration(3725), '1:02:05');
});

const P = (lat, ts, speed) => ({ latitude: lat, longitude: 127, timestamp: ts, speed });
// 위도 0.0001도 ≈ 11.1m
test('거리 누적: 새 구간 첫 점은 직전 점과 잇지 않음(일시정지 중 이동 제외)', () => {
  let acc = { distanceMeters: 0, currentSpeed: 0, last: null };
  acc = accumulateTrack(acc, P(37.0, 0), true);
  acc = accumulateTrack(acc, P(37.0001, 3000), false);
  assert.ok(Math.abs(acc.distanceMeters - 11.12) < 0.1, String(acc.distanceMeters));
  // 일시정지 후 1km 떨어진 곳에서 재개
  acc = accumulateTrack(acc, P(37.0091, 600000), true);
  assert.ok(Math.abs(acc.distanceMeters - 11.12) < 0.1);
  acc = accumulateTrack(acc, P(37.0092, 603000), false);
  assert.ok(Math.abs(acc.distanceMeters - 22.24) < 0.1);
});

test('GPS 떨림(0.5m 미만)은 거리에 넣지 않음', () => {
  let acc = accumulateTrack({ distanceMeters: 0, currentSpeed: 0, last: null }, P(37, 0), true);
  acc = accumulateTrack(acc, P(37.000003, 1000), false); // ≈0.33m
  assert.equal(acc.distanceMeters, 0);
});

const PA = (lat, ts, accuracy) => ({ latitude: lat, longitude: 127, timestamp: ts, speed: null, accuracy });
test('정확도 50m보다 나쁜 점은 버리고 직전 점에서 이어 감', () => {
  let acc = accumulateTrack({ distanceMeters: 0, currentSpeed: 0, last: null }, PA(37, 0, 120), true);
  assert.equal(acc.last, null); // 출발 직전 부정확한 첫 위치는 기준점으로 안 씀
  acc = accumulateTrack(acc, PA(37.0, 1000, 5), false);
  acc = accumulateTrack(acc, PA(37.0005, 4000, 80), false); // 55m 엉뚱한 점
  assert.equal(acc.distanceMeters, 0);
  acc = accumulateTrack(acc, PA(37.0001, 5000, 6), false);
  assert.ok(Math.abs(acc.distanceMeters - 11.12) < 0.1, String(acc.distanceMeters));
  // 정확도를 모르면(웹·일부 기기) 그대로 씀
  acc = accumulateTrack(acc, PA(37.0002, 8000, null), false);
  assert.ok(Math.abs(acc.distanceMeters - 22.24) < 0.1);
});

test('GPS 튐(10m/s 초과)은 거리에 넣지 않음 — 튀었다 돌아와도 두 배로 안 더해짐', () => {
  let acc = accumulateTrack({ distanceMeters: 0, currentSpeed: 0, last: null }, P(37.0, 0, null), true);
  acc = accumulateTrack(acc, P(37.0001, 3000, null), false); // 11m/3s 정상
  const speed = acc.currentSpeed;
  acc = accumulateTrack(acc, P(37.0011, 4000, null), false); // 1초에 111m
  assert.ok(Math.abs(acc.distanceMeters - 11.12) < 0.1);
  assert.equal(acc.currentSpeed, speed); // 현재 페이스도 튀지 않음
  acc = accumulateTrack(acc, P(37.0001, 5000, null), false); // 다시 돌아옴
  assert.ok(Math.abs(acc.distanceMeters - 11.12) < 0.1);
  acc = accumulateTrack(acc, P(37.0002, 8000, null), false);
  assert.ok(Math.abs(acc.distanceMeters - 22.24) < 0.1);
  // 기기 속도도 말이 안 되면(25m/s) 두 점 계산으로
  acc = accumulateTrack(acc, P(37.0003, 11000, 25), false);
  assert.ok(Math.abs(acc.currentSpeed - 11.12 / 3) < 0.05);
});

test('현재 속도: 기기 값 우선, 없거나 음수면 두 점으로 계산', () => {
  let acc = accumulateTrack({ distanceMeters: 0, currentSpeed: 0, last: null }, P(37, 0, null), true);
  assert.equal(acc.currentSpeed, 0);
  acc = accumulateTrack(acc, P(37.0001, 3000, null), false);
  assert.ok(Math.abs(acc.currentSpeed - 11.12 / 3) < 0.05);
  acc = accumulateTrack(acc, P(37.0002, 6000, 4.2), false);
  assert.equal(acc.currentSpeed, 4.2);
  acc = accumulateTrack(acc, P(37.0003, 9000, -1), false);
  assert.ok(Math.abs(acc.currentSpeed - 11.12 / 3) < 0.05);
});

test('500m 스플릿: 점 사이에서 500m를 넘으면 그 지점 시간을 보간', () => {
  let marks = [];
  marks = advanceSplits(marks, { distanceMeters: 0, elapsedSeconds: 0 }, { distanceMeters: 480, elapsedSeconds: 120 });
  assert.deepEqual(marks, []);
  // 480m(120초) → 520m(130초): 500m는 125초
  marks = advanceSplits(marks, { distanceMeters: 480, elapsedSeconds: 120 }, { distanceMeters: 520, elapsedSeconds: 130 });
  assert.deepEqual(marks, [125]);
  // 한 번에 두 구간을 넘어도(점 간격이 길 때) 둘 다 찍힘
  marks = advanceSplits(marks, { distanceMeters: 520, elapsedSeconds: 130 }, { distanceMeters: 1520, elapsedSeconds: 380 });
  assert.deepEqual(marks, [125, 250, 375]);
  assert.deepEqual(splitDurations(marks), [125, 125, 125]);
  // 거리가 안 늘면(정지·튐 제외) 그대로, 같은 배열
  const same = advanceSplits(marks, { distanceMeters: 1520, elapsedSeconds: 380 }, { distanceMeters: 1520, elapsedSeconds: 400 });
  assert.equal(same, marks);
  // 정확히 500m 배수에 닿아도 찍힘
  assert.deepEqual(advanceSplits([], { distanceMeters: 400, elapsedSeconds: 100 }, { distanceMeters: 500, elapsedSeconds: 120 }), [120]);
});