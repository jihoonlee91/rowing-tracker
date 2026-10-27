import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyRecordEdit,
  recordSplits,
  cleanNotes,
  concept2Watts,
  ergBests,
  ergPaceTrend,
  formatErgTime,
  isWorthSaving,
  notesText,
  normalizeRecords,
  parseDistance,
  parseDuration,
  trendDistances,
  weeklyDistances,
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

test('최근 8주 주별 거리: 주 경계(월 0시)·이번 주 미래·8주 이전 제외', () => {
  const now = new Date(2026, 9, 14, 18); // 수요일
  const rec = (id, d, m) => ({ id, source: 'erg', startedAt: d.getTime(), distanceMeters: m, durationSeconds: 100 });
  const w = weeklyDistances(
    [
      rec('mon', new Date(2026, 9, 12, 0, 0), 2000), // 이번 주
      rec('sun', new Date(2026, 9, 11, 23, 59), 5000), // 지난 주
      rec('future', new Date(2026, 9, 15, 9), 9999), // 아직 안 온 시각
      rec('old', new Date(2026, 7, 16, 12), 7777), // 8주 전 주 → 범위 밖
      rec('first', new Date(2026, 7, 24, 8), 1000), // 8주 창의 첫 주 월요일
    ],
    8,
    now
  );
  assert.equal(w.length, 8);
  assert.equal(w[0].weekStart, new Date(2026, 7, 24).getTime());
  assert.equal(w[7].weekStart, new Date(2026, 9, 12).getTime());
  assert.deepEqual(w.map((x) => x.distanceMeters), [1000, 0, 0, 0, 0, 0, 5000, 2000]);
  assert.equal(w[7].count, 1);
});

test('에르고 최고 기록: 표준 거리·에르고만, 가장 빠른 시간', () => {
  const b = ergBests([
    { id: 'a', source: 'erg', startedAt: 1, distanceMeters: 2000, durationSeconds: 460 },
    { id: 'b', source: 'erg', startedAt: 2, distanceMeters: 2000, durationSeconds: 450.5 },
    { id: 'c', source: 'gps', startedAt: 3, distanceMeters: 2000, durationSeconds: 300 },
    { id: 'd', source: 'erg', startedAt: 4, distanceMeters: 1999, durationSeconds: 300 },
    { id: 'e', source: 'erg', startedAt: 5, distanceMeters: 500, durationSeconds: 95 },
  ]);
  assert.deepEqual(b.map((r) => r.id), ['e', 'b']);
});

test('에르고 시간 표시는 0.1초까지', () => {
  assert.equal(formatErgTime(452.3), '7:32.3');
  assert.equal(formatErgTime(59.96), '1:00.0'); // 반올림이 분으로 넘어감
  assert.equal(formatErgTime(3723.04), '1:02:03.0');
  assert.equal(formatErgTime(NaN), '--:--');
});

test('거리 입력: 쉼표·k·km 허용, 틀린 형식은 null', () => {
  assert.equal(parseDistance('2000'), 2000);
  assert.equal(parseDistance(' 2,000 '), 2000);
  assert.equal(parseDistance('2k'), 2000);
  assert.equal(parseDistance('2.5K'), 2500);
  assert.equal(parseDistance('5 km'), 5000);
  assert.equal(parseDistance('6000m'), 6000);
  assert.equal(parseDistance('0'), null);
  assert.equal(parseDistance('2k2'), null);
  assert.equal(parseDistance(''), null);
  assert.equal(parseDistance('-500'), null);
  assert.equal(parseDistance('300k'), null);
});

test('페이스 추이: 같은 거리 에르고만, 오래된→최근, 최근 limit개', () => {
  const rec = (id, startedAt, d, s, source = 'erg') => ({ id, source, startedAt, distanceMeters: d, durationSeconds: s });
  const records = [
    rec('c', 30, 2000, 440),
    rec('a', 10, 2000, 480),
    rec('b', 20, 2000, 460),
    rec('g', 25, 2000, 300, 'gps'),
    rec('x', 15, 5000, 1200),
  ];
  const t = ergPaceTrend(records, 2000);
  assert.deepEqual(t.map((p) => p.id), ['a', 'b', 'c']);
  assert.equal(t[0].paceSeconds, 120);
  assert.deepEqual(ergPaceTrend(records, 2000, 2).map((p) => p.id), ['b', 'c']);
  assert.deepEqual(trendDistances(records), [2000]); // 5k는 1개뿐
});

test('실수로 바로 끈 운동은 저장 안 함', () => {
  assert.equal(isWorthSaving(10, 5), false);
  assert.equal(isWorthSaving(0, 30), true);
  assert.equal(isWorthSaving(60, 10), true);
});

test('applyRecordEdit: 바꾼 칸만 덮어쓰고 id·source·모르는 필드 유지', () => {
  const r = { id: 'a', source: 'gps', startedAt: 1000, distanceMeters: 1234.567, durationSeconds: 400, strokeRate: 23.47, notes: 'x', extra: 1 };
  const same = applyRecordEdit(r, {});
  assert.deepEqual(same, r);
  assert.notEqual(same, r);
  const e = applyRecordEdit(r, { durationSeconds: 420.5 });
  assert.equal(e.durationSeconds, 420.5);
  assert.equal(e.distanceMeters, 1234.567);
  assert.equal(e.strokeRate, 23.47);
  assert.equal(e.id, 'a');
  assert.equal(e.source, 'gps');
  assert.equal(e.extra, 1);
  assert.equal(r.durationSeconds, 400);
});

test('applyRecordEdit: strokeRate null이면 지움, 숫자면 바꿈', () => {
  const r = { id: 'a', source: 'erg', startedAt: 1, distanceMeters: 2000, durationSeconds: 450, strokeRate: 24 };
  assert.equal('strokeRate' in applyRecordEdit(r, { strokeRate: null }), false);
  assert.equal(applyRecordEdit(r, { strokeRate: 28 }).strokeRate, 28);
  const moved = applyRecordEdit(r, { startedAt: 5, distanceMeters: 5000 });
  assert.equal(moved.startedAt, 5);
  assert.equal(moved.distanceMeters, 5000);
});

test('cleanNotes: 공백·빈 줄 정리, 비면 null, 200자 제한', () => {
  assert.equal(cleanNotes('   '), null);
  assert.equal(cleanNotes('  4x500m  '), '4x500m');
  assert.equal(cleanNotes('a  \r\n\r\n\r\n\nb'), 'a\n\nb');
  assert.equal(cleanNotes('x'.repeat(250)).length, 200);
});

test('applyRecordEdit: 메모 바꾸기·지우기·유지', () => {
  const r = { id: 'a', source: 'erg', startedAt: 1, distanceMeters: 2000, durationSeconds: 450, notes: '처음', extra: 1 };
  assert.equal(applyRecordEdit(r, { notes: '바꿈' }).notes, '바꿈');
  assert.equal('notes' in applyRecordEdit(r, { notes: null }), false);
  const kept = applyRecordEdit(r, { distanceMeters: 2001 });
  assert.equal(kept.notes, '처음');
  assert.equal(kept.extra, 1);
});

test('notesText: 문자열이 아닌 저장값은 빈 글자', () => {
  assert.equal(notesText({ notes: ' 메모 ' }), '메모');
  assert.equal(notesText({}), '');
  assert.equal(notesText({ notes: 42 }), '');
});
test('스플릿: 저장값 검사, 거리·시간을 고치면 버림(메모만 고치면 유지)', () => {
  assert.deepEqual(recordSplits({ splits: [121.3, 119.8] }), [121.3, 119.8]);
  assert.deepEqual(recordSplits({}), []);
  assert.deepEqual(recordSplits({ splits: 'x' }), []);
  assert.deepEqual(recordSplits({ splits: [120, null] }), []);
  const r = { id: 'a', source: 'gps', startedAt: 1, distanceMeters: 1000, durationSeconds: 241, splits: [121, 120] };
  assert.deepEqual(applyRecordEdit(r, { notes: '좋음' }).splits, [121, 120]);
  assert.deepEqual(applyRecordEdit(r, { distanceMeters: 1000 }).splits, [121, 120]);
  assert.equal(applyRecordEdit(r, { distanceMeters: 1100 }).splits, undefined);
  assert.equal(applyRecordEdit(r, { durationSeconds: 250 }).splits, undefined);
  assert.deepEqual(r.splits, [121, 120]); // 원본은 그대로
});