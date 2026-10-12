// node --test tests/ (Node 22.18+/24: .ts 타입 제거 내장)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accumulateTrack, formatDuration, formatPacePer500m } from '../src/lib/geo.ts';

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
