import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { mergeImported } from './csv';
import { applyRecordEdit, normalizeRecords, type RecordPatch, type WorkoutRecord } from './workouts';

const STORAGE_KEY = 'rowing-tracker:workouts:v1';

// strict면 저장된 값이 깨졌을 때 빈 목록 대신 오류를 낸다(쓰기 전에 읽을 때 — 깨진 원본을 덮어써 지우지 않도록).
async function readAll(strict = false): Promise<WorkoutRecord[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return normalizeRecords(JSON.parse(raw));
  } catch (e) {
    if (strict) throw e;
    return [];
  }
}

async function writeAll(records: WorkoutRecord[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

// 다른 탭(트래커)에서 저장한 기록이 기록 탭에 바로 보이도록 같은 앱 안의 구독자에게 알린다.
const listeners = new Set<(records: WorkoutRecord[]) => void>();

// 읽기→추가→쓰기를 한 줄로 세워 동시에 저장해도 기록이 사라지지 않게 한다.
let queue: Promise<unknown> = Promise.resolve();
function mutate(fn: (records: WorkoutRecord[]) => WorkoutRecord[]) {
  const run = queue.then(async () => {
    const next = normalizeRecords(fn(await readAll(true)));
    await writeAll(next);
    listeners.forEach((l) => l(next));
    return next;
  });
  queue = run.catch(() => undefined);
  return run;
}

export function addWorkout(record: Omit<WorkoutRecord, 'id'>) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return mutate((prev) => [...prev, { ...record, id }]);
}

export function useWorkoutLog() {
  const [records, setRecords] = useState<WorkoutRecord[] | null>(null);

  useEffect(() => {
    let alive = true;
    readAll().then((r) => alive && setRecords(r));
    const listener = (r: WorkoutRecord[]) => setRecords(r);
    listeners.add(listener);
    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, []);

  const removeWorkout = useCallback(
    (id: string) => mutate((prev) => prev.filter((r) => r.id !== id)),
    []
  );

  // 없는 id(그 사이 지워짐)면 아무것도 바꾸지 않는다.
  const updateWorkout = useCallback(
    (id: string, patch: RecordPatch) =>
      mutate((prev) => prev.map((r) => (r.id === id ? applyRecordEdit(r, patch) : r))),
    []
  );

  // CSV에서 읽은 기록을 더한다(이미 있는 기록은 건너뜀). 더한 개수를 돌려준다.
  const importWorkouts = useCallback(async (incoming: WorkoutRecord[]) => {
    let added = 0;
    await mutate((prev) => {
      const r = mergeImported(prev, incoming);
      added = r.added;
      return r.merged;
    });
    return added;
  }, []);

  return { records, addWorkout, removeWorkout, updateWorkout, importWorkouts };
}
