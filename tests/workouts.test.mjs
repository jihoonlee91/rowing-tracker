import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  concept2Watts,
  isWorthSaving,
  normalizeRecords,
  parseDuration,
  weekTotals,
} from '../src/lib/workouts.ts';

test('시간 입력 파싱', () => {
  assert.equal(parseDuration('7:30.5'), 450.5);
  assert.equal(parseDuration('1:02:03'), 3723);
  assert.equal(parseDuration('7:30'), 450);
  assert.equal(parseDuration(' 450 '), 450);
  assert.equal(parseDuration('7:60'), null);
  assert.equal(parseDuration('abc'), null);
  assert.equal(parseDuration(''), null);
  assert.equal(parseDuration('0:00'), null);
});

test('콘셉트2 와트: 2:00/500m ≈ 203W, 1:45/500m ≈ 302W', () => {
  assert.equal(Math.round(concept2Watts(500, 120)), 203);
  assert.equal(Math.round(concept2Watts(2000, 420)), 302);
  assert.equal(concept2Watts(0, 100), 0);
  assert.equal(concept2Watts(100, 0), 0);
});

test('저장 데이터 읽기: 깨진 항목은 버리고 최신순, 모르는 source는 gps', () => {
  const recs = normalizeRecords([
    { id: 'a', source: 'erg', startedAt: 1000, distanceMeters: 2000, durationSeconds: 450 },
    { id: 'b', startedAt: 3000, distanceMeters: 5000, durationSeconds: 1500, extra: 1 },
    { id: 'c', startedAt: 'x', distanceMeters: 1, durationSeconds: 1 },
    null,
  ]);
  assert.deepEqual(recs.map((r) => r.id), ['b', 'a']);
  assert.equal(recs[0].source, 'gps');
  assert.equal(recs[0].extra, 1); // 모르는 필드도 보존(이후 형식 호환)
  assert.deepEqual(normalizeRecords('nope'), []);
});

test('이번 주 합계는 월요일 0시부터', () => {
  const now = new Date(2026, 9, 14, 18); // 수요일
  const mon = new Date(2026, 9, 12, 0, 30).getTime();
  const sun = new Date(2026, 9, 11, 23).getTime();
  const t = weekTotals(
    [
      { id: '1', source: 'erg', startedAt: mon, distanceMeters: 2000, durationSeconds: 450 },
      { id: '2', source: 'gps', startedAt: sun, distanceMeters: 8000, durationSeconds: 2400 },
    ],
    now
  );
  assert.deepEqual(t, { distanceMeters: 2000, durationSeconds: 450, count: 1 });
});

test('실수로 바로 끈 운동은 저장 안 함', () => {
  assert.equal(isWorthSaving(10, 5), false);
  assert.equal(isWorthSaving(0, 30), true);
  assert.equal(isWorthSaving(60, 10), true);
});
