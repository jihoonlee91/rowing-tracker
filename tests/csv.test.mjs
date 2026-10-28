import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csvToRecords, decodeCsvBytes, mergeImported, parseCsv, recordsToCsv } from '../src/lib/csv.ts';

const sample = [
  {
    id: 'a1',
    source: 'erg',
    startedAt: new Date(2026, 9, 14, 12, 0, 0).getTime(),
    distanceMeters: 2000,
    durationSeconds: 452.3,
    strokeRate: 28,
    notes: '2k 테스트, "전력"',
  },
  {
    id: 'g1',
    source: 'gps',
    startedAt: new Date(2026, 9, 12, 7, 5, 9).getTime(),
    distanceMeters: 8123.4,
    durationSeconds: 2400,
    strokeCount: 480,
    splits: [150.2, 148.9, 151],
  },
];

test('CSV 따옴표·쉼표·줄바꿈·BOM 파싱', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x,1","say ""hi""\nok"\n\n'), [
    ['a', 'b'],
    ['x,1', 'say "hi"\nok'],
  ]);
});

test('내보낸 CSV를 다시 읽으면 같은 기록', () => {
  const csv = recordsToCsv(sample);
  assert.match(csv.split('\n')[1], /^2026-10-12 07:05:09,gps,8123.4,2400,40:00.0,2:27.7,,480,,g1,150.2 148.9 151$/);
  assert.match(csv, /7:32.3,1:53.1,28/);
  assert.match(csv.split('\n')[2], /,a1,$/);
  const { records, skipped, format } = csvToRecords(csv);
  assert.equal(format, 'app');
  assert.equal(skipped, 0);
  const byId = Object.fromEntries(records.map((r) => [r.id, r]));
  for (const r of sample) {
    assert.deepEqual(byId[r.id], r);
  }
});

test('스플릿 — 0.1초로 내보냄, 이전 백업(열 없음)·이상한 값은 스플릿 없이 가져옴', () => {
  const csv = recordsToCsv([{ ...sample[1], splits: [150.23, 148.87] }]);
  assert.deepEqual(csvToRecords(csv).records[0].splits, [150.2, 148.9]);
  // 2026-10-28 이전 앱이 내보낸 CSV(splits_500m 열 없음)
  const old = 'date,source,distance_m,time_s,time,pace_500m,spm,strokes,notes,id\n2026-10-12 07:05:09,gps,8123.4,2400,40:00.0,2:27.7,,480,,g1\n';
  const [rec] = csvToRecords(old).records;
  assert.equal(rec.id, 'g1');
  assert.equal('splits' in rec, false);
  const head = 'date,source,distance_m,time_s,id,splits_500m\n';
  assert.equal('splits' in csvToRecords(head + '2026-10-12,gps,1000,300,x,150 abc\n').records[0], false);
  assert.equal('splits' in csvToRecords(head + '2026-10-12,gps,1000,300,x,150 -2\n').records[0], false);
  assert.deepEqual(csvToRecords(head + '2026-10-12,gps,1000,300,x,"150.5;149.5"\n').records[0].splits, [150.5, 149.5]);
  // 저장값이 깨진 스플릿은 빈칸으로 내보냄
  assert.match(recordsToCsv([{ ...sample[1], splits: ['x'] }]), /,g1,\n$/);
});

test('콘셉트2 로그북 CSV — RowErg만, ID로 중복 방지', () => {
  const c2 = [
    '"ID","Date","Description","Work Time (Formatted)","Work Time (Seconds)","Rest Time (Formatted)","Rest Time (Seconds)","Work Distance","Rest Distance","Stroke Rate/Cadence","Stroke Count","Pace","Avg Watts","Cal/Hour","Total Cal","Avg Heart Rate","Drag Factor","Age","Weight","Type","Ranked","Comments","Date Entered"',
    '"98765","2026-10-10 18:30:00","2000m row","7:30.5","450.5","","","2000","","27","203","1:52.6","246","","","","","","","RowErg","Yes","good","2026-10-10"',
    '"98766","2026-10-11 09:00:00","10000m","40:00.0","2400","","","10000","","22","","2:00.0","202","","","","","","","SkiErg","No","",""',
    '"98767","bad date","","","","","","","","","","","","","","","","","","RowErg","","",""',
  ].join('\n');
  const { records, skipped, format } = csvToRecords(c2);
  assert.equal(format, 'concept2');
  assert.equal(skipped, 2);
  assert.equal(records.length, 1);
  assert.deepEqual(records[0], {
    id: 'c2-98765',
    source: 'erg',
    startedAt: new Date(2026, 9, 10, 18, 30).getTime(),
    distanceMeters: 2000,
    durationSeconds: 450.5,
    strokeRate: 27,
    strokeCount: 203,
    notes: 'good',
  });
  const once = mergeImported([], records);
  assert.equal(once.added, 1);
  assert.equal(mergeImported(once.merged, records).added, 0);
});

test('모르는 CSV는 가져오지 않음', () => {
  assert.equal(csvToRecords('foo,bar\n1,2\n').format, null);
  assert.equal(csvToRecords('').records.length, 0);
});

test('id가 달라도 같은 분·거리·시간이면 중복으로 봄', () => {
  const dup = { ...sample[0], id: 'other', startedAt: sample[0].startedAt + 20_000 };
  assert.equal(mergeImported(sample, [dup]).added, 0);
  assert.equal(mergeImported(sample, [{ ...dup, durationSeconds: 452.4 }]).added, 1);
});

test('파일 글자 변환 — UTF-8(BOM 포함)과 엑셀 CP949 CSV', () => {
  const utf8 = new TextEncoder().encode('﻿date,notes\n2026-10-10,메모 좋음');
  assert.equal(decodeCsvBytes(utf8), 'date,notes\n2026-10-10,메모 좋음');
  // '메모 좋음'을 CP949로 저장한 바이트
  const cp949 = new Uint8Array([0xb8, 0xde, 0xb8, 0xf0, 0x20, 0xc1, 0xc1, 0xc0, 0xbd]);
  assert.equal(decodeCsvBytes(cp949), '메모 좋음');
  // 파일로 읽은 앱 CSV가 그대로 가져와짐
  const bytes = new TextEncoder().encode('﻿' + recordsToCsv(sample));
  assert.equal(csvToRecords(decodeCsvBytes(bytes)).records.length, sample.length);
});
