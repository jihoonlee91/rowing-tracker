// 주간 훈련 계획 ↔ 실제 기록 연결. AsyncStorage에 의존하지 않는 순수 함수만 둔다(테스트에서 바로 import).
import type { TrainingSession, Weekday } from './trainingPlan';
import type { WorkoutRecord } from './workouts';

const DAYS: Weekday[] = ['월', '화', '수', '목', '금', '토', '일'];

export function mondayOf(d: Date) {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

export function weekdayOf(ms: number): Weekday {
  return DAYS[(new Date(ms).getDay() + 6) % 7];
}

// 완료 표시는 체크한 주에만 유효하다(다음 주 월요일이 되면 다시 할 일로).
// doneAt이 없는 이전 형식의 done: true는 그대로 완료로 본다.
export function isDoneThisWeek(s: Pick<TrainingSession, 'done' | 'doneAt'>, now = new Date()) {
  if (!s.done) return false;
  if (typeof s.doneAt !== 'number') return true;
  return s.doneAt >= mondayOf(now).getTime();
}

// 이번 주 요일별 실제 기록 합계(미래 시각 제외)
export function weekActualsByDay(records: WorkoutRecord[], now = new Date()) {
  const from = mondayOf(now).getTime();
  const to = now.getTime();
  const map = new Map<Weekday, { distanceMeters: number; durationSeconds: number; count: number }>();
  DAYS.forEach((d) => map.set(d, { distanceMeters: 0, durationSeconds: 0, count: 0 }));
  for (const r of records) {
    if (r.startedAt < from || r.startedAt > to) continue;
    const t = map.get(weekdayOf(r.startedAt))!;
    t.distanceMeters += r.distanceMeters;
    t.durationSeconds += r.durationSeconds;
    t.count += 1;
  }
  return map;
}

// 이번 주 계획 대비: 완료 세션 수, 목표 거리 합계(휴식 제외) vs 실제 거리
export function planWeekSummary(sessions: TrainingSession[], records: WorkoutRecord[], now = new Date()) {
  const active = sessions.filter((s) => s.type !== 'rest');
  let targetMeters = 0;
  for (const s of active) if (s.targetDistanceKm && s.targetDistanceKm > 0) targetMeters += s.targetDistanceKm * 1000;
  let actualMeters = 0;
  weekActualsByDay(records, now).forEach((t) => (actualMeters += t.distanceMeters));
  return {
    planned: active.length,
    done: active.filter((s) => isDoneThisWeek(s, now)).length,
    targetMeters,
    actualMeters,
  };
}

// 목표 숫자 입력: "6", "6.5", "6,5"(쉼표 소수점) → 숫자. 비었거나 0 이하·형식이 틀리면 undefined.
export function parseTarget(text: string): number | undefined {
  const s = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return n > 0 ? n : undefined;
}

// 저장된 계획 JSON 읽기: 깨진 항목은 버리고 모르는 필드는 보존(이전·이후 형식 호환).
export function normalizeSessions(raw: unknown): TrainingSession[] {
  if (!Array.isArray(raw)) return [];
  const out: TrainingSession[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    if (typeof s.id !== 'string' || !DAYS.includes(s.day as Weekday) || typeof s.title !== 'string') continue;
    out.push({ ...(s as object), done: s.done === true } as TrainingSession);
  }
  return out;
}
