import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isDoneThisWeek,
  normalizeSessions,
  parseTarget,
  planWeekSummary,
  weekActualsByDay,
  weekdayOf,
} from '../src/lib/planWeek.ts';

// 2026-10-21은 수요일
const now = new Date(2026, 9, 21, 18, 0);
const at = (d, h = 7) => new Date(2026, 9, d, h, 0).getTime();

test('요일 계산(월요일 시작)', () => {
  assert.equal(weekdayOf(at(19)), '월');
  assert.equal(weekdayOf(at(21)), '수');
  assert.equal(weekdayOf(at(25)), '일');
});

test('완료 표시는 그 주에만, 이전 형식(doneAt 없음)은 완료 유지', () => {
  assert.equal(isDoneThisWeek({ done: true, doneAt: at(20) }, now), true);
  assert.equal(isDoneThisWeek({ done: true, doneAt: at(18) }, now), false); // 지난주 일요일
  assert.equal(isDoneThisWeek({ done: true }, now), true);
  assert.equal(isDoneThisWeek({ done: false, doneAt: at(20) }, now), false);
});

test('이번 주 요일별 실제 기록(지난주·미래 제외)', () => {
  const recs = [
    { id: 'a', source: 'gps', startedAt: at(19), distanceMeters: 6000, durationSeconds: 1800 },
    { id: 'b', source: 'erg', startedAt: at(19, 19), distanceMeters: 2000, durationSeconds: 450 },
    { id: 'c', source: 'erg', startedAt: at(18), distanceMeters: 5000, durationSeconds: 1200 },
    { id: 'd', source: 'erg', startedAt: at(21, 20), distanceMeters: 1000, durationSeconds: 210 },
  ];
  const m = weekActualsByDay(recs, now);
  assert.deepEqual(m.get('월'), { distanceMeters: 8000, durationSeconds: 2250, count: 2 });
  assert.equal(m.get('수').count, 0);
  assert.equal(m.get('일').count, 0);
});

test('계획 대비 요약: 휴식 제외, 목표 거리 합계', () => {
  const sessions = [
    { id: '1', day: '월', type: 'steady', title: 'SS', targetDistanceKm: 6, done: true, doneAt: at(19, 9) },
    { id: '2', day: '수', type: 'erg', title: '2k', targetDistanceKm: 2, done: true, doneAt: at(14) },
    { id: '3', day: '일', type: 'rest', title: '휴식', done: true },
  ];
  const recs = [{ id: 'a', source: 'gps', startedAt: at(19), distanceMeters: 6200, durationSeconds: 1800 }];
  assert.deepEqual(planWeekSummary(sessions, recs, now), {
    planned: 2,
    done: 1,
    targetMeters: 8000,
    actualMeters: 6200,
  });
});

test('목표 숫자 입력', () => {
  assert.equal(parseTarget('6'), 6);
  assert.equal(parseTarget('6,5'), 6.5);
  assert.equal(parseTarget(' 6.5 '), 6.5);
  assert.equal(parseTarget(''), undefined);
  assert.equal(parseTarget('abc'), undefined);
  assert.equal(parseTarget('0'), undefined);
});

test('저장된 계획 읽기: 깨진 항목 버리고 모르는 필드 보존', () => {
  const out = normalizeSessions([
    { id: '1', day: '월', type: 'steady', title: 'SS', done: true, extra: 1 },
    { id: '2', day: 'X', type: 'steady', title: 'bad' },
    null,
    { id: '3', day: '화', type: 'erg', title: '2k' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].extra, 1);
  assert.equal(out[1].done, false);
  assert.deepEqual(normalizeSessions('nope'), []);
});
