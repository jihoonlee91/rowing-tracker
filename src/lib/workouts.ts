// 운동 기록(저장 형식·계산). AsyncStorage에 의존하지 않는 순수 함수만 둔다(테스트에서 바로 import).

export type WorkoutSource = 'gps' | 'erg';

export type WorkoutRecord = {
  id: string;
  source: WorkoutSource;
  // 운동 시작(또는 입력한 날) 시각, epoch ms
  startedAt: number;
  distanceMeters: number;
  durationSeconds: number;
  strokeCount?: number;
  // 평균 스트로크율. 에르고 입력은 화면에 나온 값을 그대로 받는다.
  strokeRate?: number;
  notes?: string;
};

// "7:30.5", "1:02:03", "7:30", "450" → 초. 형식이 틀리거나 0 이하면 null.
export function parseDuration(text: string): number | null {
  const s = text.trim();
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(s)) return null;
  const [main, frac] = s.split('.');
  const parts = main.split(':').map(Number);
  if (parts.slice(1).some((p) => p >= 60)) return null;
  let total = 0;
  for (const p of parts) total = total * 60 + p;
  if (frac) total += Number(`0.${frac}`);
  return total > 0 ? total : null;
}

// 에르고 화면처럼 0.1초까지: 452.3 → "7:32.3", 3723.04 → "1:02:03.0"
export function formatErgTime(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '--:--';
  const tenths = Math.round(totalSeconds * 10);
  const h = Math.floor(tenths / 36000);
  const m = Math.floor((tenths % 36000) / 600);
  const s = Math.floor((tenths % 600) / 10);
  const ss = `${String(s).padStart(2, '0')}.${tenths % 10}`;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// 콘셉트2 공식: 와트 = 2.80 / (초/미터)^3
export function concept2Watts(distanceMeters: number, durationSeconds: number): number {
  if (!(distanceMeters > 0) || !(durationSeconds > 0)) return 0;
  const pace = durationSeconds / distanceMeters;
  return 2.8 / pace ** 3;
}

export function avgSpeed(r: Pick<WorkoutRecord, 'distanceMeters' | 'durationSeconds'>) {
  return r.durationSeconds > 0 ? r.distanceMeters / r.durationSeconds : 0;
}

// 저장된 JSON을 읽을 때 깨진 항목은 버리고, 빠진 선택 값은 그대로 둔다(이전·이후 형식 호환).
export function normalizeRecords(raw: unknown): WorkoutRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: WorkoutRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const distanceMeters = Number(r.distanceMeters);
    const durationSeconds = Number(r.durationSeconds);
    const startedAt = Number(r.startedAt);
    if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSeconds) || !Number.isFinite(startedAt)) continue;
    out.push({
      ...(r as object),
      id: typeof r.id === 'string' ? r.id : `${startedAt}`,
      source: r.source === 'erg' ? 'erg' : 'gps',
      startedAt,
      distanceMeters,
      durationSeconds,
    } as WorkoutRecord);
  }
  return out.sort((a, b) => b.startedAt - a.startedAt);
}

// 이번 주(월요일 0시부터, 기기 시간대) 합계
export function weekTotals(records: WorkoutRecord[], now = new Date()) {
  const from = mondayOf(now).getTime();
  let distanceMeters = 0;
  let durationSeconds = 0;
  let count = 0;
  for (const r of records) {
    if (r.startedAt >= from && r.startedAt <= now.getTime()) {
      distanceMeters += r.distanceMeters;
      durationSeconds += r.durationSeconds;
      count += 1;
    }
  }
  return { distanceMeters, durationSeconds, count };
}

function mondayOf(d: Date) {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

// 최근 n주(이번 주 포함, 오래된 주 → 이번 주) 주별 거리 합계. weekStart는 그 주 월요일 0시.
export function weeklyDistances(records: WorkoutRecord[], weeks = 8, now = new Date()) {
  const starts: number[] = [];
  const thisMonday = mondayOf(now);
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(thisMonday);
    d.setDate(d.getDate() - 7 * i); // 날짜로 빼서 서머타임이 있어도 월요일 0시 유지
    starts.push(d.getTime());
  }
  const totals = starts.map((weekStart) => ({ weekStart, distanceMeters: 0, count: 0 }));
  const end = now.getTime();
  for (const r of records) {
    if (r.startedAt < starts[0] || r.startedAt > end) continue;
    let i = starts.length - 1;
    while (i > 0 && r.startedAt < starts[i]) i--;
    totals[i].distanceMeters += r.distanceMeters;
    totals[i].count += 1;
  }
  return totals;
}

// 에르고 표준 거리 최고 기록(거리가 정확히 같은 기록 중 가장 빠른 시간).
export const STANDARD_ERG_DISTANCES = [500, 1000, 2000, 5000, 6000, 10000];

export function ergBests(records: WorkoutRecord[]) {
  const best = new Map<number, WorkoutRecord>();
  for (const r of records) {
    if (r.source !== 'erg' || !STANDARD_ERG_DISTANCES.includes(r.distanceMeters)) continue;
    if (!(r.durationSeconds > 0)) continue;
    const cur = best.get(r.distanceMeters);
    if (!cur || r.durationSeconds < cur.durationSeconds) best.set(r.distanceMeters, r);
  }
  return STANDARD_ERG_DISTANCES.filter((d) => best.has(d)).map((d) => best.get(d)!);
}

// 같은 표준 거리 에르고 기록의 /500m 페이스(초) 추이, 오래된 → 최근. 최근 limit개만.
export function ergPaceTrend(records: WorkoutRecord[], distanceMeters: number, limit = 12) {
  return records
    .filter((r) => r.source === 'erg' && r.distanceMeters === distanceMeters && r.durationSeconds > 0)
    .sort((a, b) => a.startedAt - b.startedAt)
    .slice(-limit)
    .map((r) => ({ id: r.id, startedAt: r.startedAt, paceSeconds: (r.durationSeconds / r.distanceMeters) * 500 }));
}

// 추이를 그릴 수 있는(에르고 기록이 2개 이상인) 표준 거리
export function trendDistances(records: WorkoutRecord[]) {
  const count = new Map<number, number>();
  for (const r of records) {
    if (r.source === 'erg' && r.durationSeconds > 0) count.set(r.distanceMeters, (count.get(r.distanceMeters) ?? 0) + 1);
  }
  return STANDARD_ERG_DISTANCES.filter((d) => (count.get(d) ?? 0) >= 2);
}

// 거리 입력: "2000", "2,000", "2k", "2.5k", "5 km", "6000m" → 미터. 형식이 틀리거나 0 이하·200km 초과면 null.
export function parseDistance(text: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*(k|km|m)?$/i.exec(text.trim().replace(/,/g, ''));
  if (!m) return null;
  const meters = Number(m[1]) * (m[2] && m[2].toLowerCase() !== 'm' ? 1000 : 1);
  const rounded = Math.round(meters * 10) / 10;
  return rounded > 0 && rounded <= 200000 ? rounded : null;
}

// 기록 수정: 바꾼 칸만 덮어쓰고 id·source·모르는 필드(notes 등)는 그대로 둔다.
// undefined = 안 바꿈, strokeRate null = 지움.
export type RecordPatch = {
  startedAt?: number;
  distanceMeters?: number;
  durationSeconds?: number;
  strokeRate?: number | null;
};

export function applyRecordEdit(record: WorkoutRecord, patch: RecordPatch): WorkoutRecord {
  const next: WorkoutRecord = { ...record };
  if (patch.startedAt !== undefined) next.startedAt = patch.startedAt;
  if (patch.distanceMeters !== undefined) next.distanceMeters = patch.distanceMeters;
  if (patch.durationSeconds !== undefined) next.durationSeconds = patch.durationSeconds;
  if (patch.strokeRate === null) delete next.strokeRate;
  else if (patch.strokeRate !== undefined) next.strokeRate = patch.strokeRate;
  return next;
}

// 너무 짧은 운동(실수로 시작→종료)은 저장하지 않는다.
export function isWorthSaving(distanceMeters: number, durationSeconds: number) {
  return durationSeconds >= 30 || distanceMeters >= 50;
}
