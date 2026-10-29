import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventLink, normalizeEvents } from '../src/lib/raceHub.ts';

test('대회 응답 정리: 빠진 칸은 기본값, id·제목 없는 항목·중복은 버림', () => {
  const events = normalizeEvents({
    events: [
      { id: 'a', title: '조정 대회', date: '2026-11-01', registrationStatus: 'open' },
      { id: 'b', title: '2k 대회', distances: ['2000m', 3, ''], registrationStatus: 'weird' },
      { id: 'a', title: '중복' },
      { title: 'id 없음' },
      { id: 'c' },
      null,
      '문자열',
    ],
  });
  assert.deepEqual(events.map((e) => e.id), ['a', 'b']);
  assert.deepEqual(events[0].distances, []);
  assert.equal(events[0].registrationStatus, 'open');
  assert.equal(events[0].linkVerified, false);
  assert.deepEqual(events[1].distances, ['2000m']);
  assert.equal(events[1].registrationStatus, 'unknown');
});

test('대회 응답 형식이 아니면 빈 목록', () => {
  assert.deepEqual(normalizeEvents(null), []);
  assert.deepEqual(normalizeEvents({}), []);
  assert.deepEqual(normalizeEvents({ events: 'x' }), []);
});

test('카드 링크: 확인된 신청 링크 → 출처, http(s)만', () => {
  assert.equal(
    eventLink({ applyUrl: 'https://a.kr/apply', sourceUrl: 'https://a.kr', linkVerified: true }),
    'https://a.kr/apply',
  );
  assert.equal(
    eventLink({ applyUrl: 'https://a.kr/apply', sourceUrl: 'https://a.kr', linkVerified: false }),
    'https://a.kr',
  );
  assert.equal(
    eventLink({ applyUrl: 'javascript:alert(1)', sourceUrl: 'http://b.kr/x', linkVerified: true }),
    'http://b.kr/x',
  );
  assert.equal(eventLink({ applyUrl: '', sourceUrl: 'intent://x', linkVerified: true }), null);
  assert.equal(eventLink({ applyUrl: '', sourceUrl: 'https://', linkVerified: false }), null);
});
