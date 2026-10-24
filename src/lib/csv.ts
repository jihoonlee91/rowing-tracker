// 기록 CSV 내보내기·가져오기(순수 함수). 테스트가 .ts를 바로 import하므로 값 import 없이 타입만 가져온다.
import type { WorkoutRecord } from './workouts';

const HEADER = ['date', 'source', 'distance_m', 'time_s', 'time', 'pace_500m', 'spm', 'strokes', 'notes', 'id'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// 기기 시간대 "2026-10-14 12:00:00"
function localDateTime(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function clock(seconds: number) {
  const tenths = Math.round(seconds * 10);
  const h = Math.floor(tenths / 36000);
  const m = Math.floor((tenths % 36000) / 600);
  const s = `${pad(Math.floor((tenths % 600) / 10))}.${tenths % 10}`;
  return h > 0 ? `${h}:${pad(m)}:${s}` : `${m}:${s}`;
}

function cell(v: unknown) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function recordsToCsv(records: WorkoutRecord[]) {
  const rows = [...records]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((r) =>
      [
        localDateTime(r.startedAt),
        r.source,
        Math.round(r.distanceMeters * 10) / 10,
        Math.round(r.durationSeconds * 10) / 10,
        clock(r.durationSeconds),
        r.distanceMeters > 0 ? clock((r.durationSeconds / r.distanceMeters) * 500) : '',
        r.strokeRate ?? '',
        r.strokeCount ?? '',
        r.notes ?? '',
        r.id,
      ]
        .map(cell)
        .join(',')
    );
  return [HEADER.join(','), ...rows].join('\n') + '\n';
}

// RFC 4180 정도: 따옴표 안의 쉼표·줄바꿈·"" 처리. 빈 줄은 버린다.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

// "2026-10-14 07:32:00", "2026-10-14T07:32", "2026-10-14" → 기기 시간대 ms(날짜만이면 정오).
function parseLocalDate(text: string): number | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text.trim());
  if (!m) return null;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    m[4] != null ? Number(m[4]) : 12,
    m[5] != null ? Number(m[5]) : 0,
    m[6] != null ? Number(m[6]) : 0
  );
  return d.getMonth() === Number(m[2]) - 1 ? d.getTime() : null;
}

function num(text: string | undefined) {
  if (text == null) return NaN;
  const s = text.replace(/,/g, '').trim();
  return s === '' ? NaN : Number(s);
}

export type CsvImport = {
  // id·source·startedAt·distanceMeters·durationSeconds가 채워진 기록(저장 전에 normalizeRecords를 거친다)
  records: WorkoutRecord[];
  skipped: number;
  format: 'app' | 'concept2' | null;
};

// 이 앱이 내보낸 CSV 또는 콘셉트2 로그북(log.concept2.com) CSV를 읽는다.
export function csvToRecords(text: string): CsvImport {
  const rows = parseCsv(text);
  if (rows.length === 0) return { records: [], skipped: 0, format: null };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));

  let format: CsvImport['format'] = null;
  let iDate = -1, iDist = -1, iTime = -1, iSpm = -1, iStrokes = -1, iId = -1, iSource = -1, iNotes = -1, iType = -1;
  if (head.includes('distance_m') && head.includes('time_s')) {
    format = 'app';
    iDate = col('date');
    iDist = col('distance_m');
    iTime = col('time_s');
    iSpm = col('spm');
    iStrokes = col('strokes');
    iId = col('id');
    iSource = col('source');
    iNotes = col('notes');
  } else if (head.includes('work distance') && head.includes('work time (seconds)')) {
    format = 'concept2';
    iDate = col('date');
    iDist = col('work distance');
    iTime = col('work time (seconds)');
    iSpm = col('stroke rate/cadence', 'stroke rate');
    iStrokes = col('stroke count');
    iId = col('id', 'log id');
    iNotes = col('comments');
    iType = col('type');
  }
  if (!format || iDate < 0 || iDist < 0 || iTime < 0) {
    return { records: [], skipped: rows.length - 1, format: null };
  }

  const records: WorkoutRecord[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const startedAt = parseLocalDate(r[iDate] ?? '');
    const distanceMeters = num(r[iDist]);
    const durationSeconds = num(r[iTime]);
    // 콘셉트2는 RowErg만(스키·바이크 에르고는 조정 기록이 아님)
    const type = iType >= 0 ? (r[iType] ?? '').trim().toLowerCase() : '';
    if (
      startedAt == null ||
      !(distanceMeters > 0) ||
      !(durationSeconds > 0) ||
      (type !== '' && !type.includes('row'))
    ) {
      skipped++;
      continue;
    }
    const spm = num(r[iSpm]);
    const strokes = num(r[iStrokes]);
    const rawId = iId >= 0 ? (r[iId] ?? '').trim() : '';
    const notes = iNotes >= 0 ? (r[iNotes] ?? '').trim() : '';
    const rec: WorkoutRecord = {
      id: format === 'concept2' ? (rawId ? `c2-${rawId}` : '') : rawId,
      source: format === 'concept2' ? 'erg' : (r[iSource] ?? '').trim() === 'erg' ? 'erg' : 'gps',
      startedAt,
      distanceMeters,
      durationSeconds,
    };
    if (!rec.id) rec.id = `imp-${startedAt}-${Math.round(distanceMeters)}-${Math.round(durationSeconds * 10)}`;
    if (spm > 0) rec.strokeRate = spm;
    if (strokes > 0) rec.strokeCount = Math.round(strokes);
    if (notes) rec.notes = notes;
    records.push(rec);
  }
  return { records, skipped, format };
}

// 같은 id, 또는 같은 분·거리·시간(0.1초)인 기록은 이미 있는 것으로 보고 건너뛴다.
export function mergeImported(existing: WorkoutRecord[], incoming: WorkoutRecord[]) {
  const sig = (r: WorkoutRecord) =>
    `${Math.floor(r.startedAt / 60000)}|${Math.round(r.distanceMeters)}|${Math.round(r.durationSeconds * 10)}`;
  const ids = new Set(existing.map((r) => r.id));
  const sigs = new Set(existing.map(sig));
  const added: WorkoutRecord[] = [];
  for (const r of incoming) {
    if (ids.has(r.id) || sigs.has(sig(r))) continue;
    ids.add(r.id);
    sigs.add(sig(r));
    added.push(r);
  }
  return { merged: [...existing, ...added], added: added.length };
}

// 가져올 CSV 파일 크기 상한. 몇 년치 로그북도 1MB가 안 되니, 넘으면 잘못 고른 파일로 본다.
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

// 파일로 고른 CSV를 글자로 바꾼다. 보통은 UTF-8이지만, 한글 윈도우 엑셀에서 '다른 이름으로 저장'한
// CSV는 CP949(EUC-KR)라 UTF-8로 읽으면 메모가 깨진다 → UTF-8이 아니면 EUC-KR로 다시 읽는다.
export function decodeCsvBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder('euc-kr').decode(bytes);
    } catch {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }
}
