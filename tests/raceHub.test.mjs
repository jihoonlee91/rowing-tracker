import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventLink, normalizeEvents, upcomingEvents } from '../src/lib/raceHub.ts';

test('끝난 대회는 숨기고 가까운 날짜순, 날짜를 모르면 맨 뒤', () => {
  const now = new Date(2026, 9, 31, 8, 0); // 2026-10-31
  const ev = (id, date, endDate) => ({ id, date, endDate });
  const ids = upcomingEvents(
    [
      ev('모름', ''),
      ev('내년', '2027-03-01'),
      ev('끝남', '2026-10-30'),
      ev('오늘', '2026-10-31'),
      ev('여러날-진행중', '2026-10-30', '2026-11-01'),
      ev('여러날-끝남', '2026-10-01', '2026-10-03'),
      ev('이상한형식', '11월 초'),
    ],
    now,
  ).map((e) => e.id);
  assert.deepEqual(ids, ['여러날-진행중', '오늘', '내년', '모름', '이상한형식']);
});

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
