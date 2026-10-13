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
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const from = monday.getTime();
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

// 너무 짧은 운동(실수로 시작→종료)은 저장하지 않는다.
export function isWorthSaving(distanceMeters: number, durationSeconds: number) {
  return durationSeconds >= 30 || distanceMeters >= 50;
}
