import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { normalizeRecords, type WorkoutRecord } from './workouts';

const STORAGE_KEY = 'rowing-tracker:workouts:v1';

async function readAll(): Promise<WorkoutRecord[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return normalizeRecords(JSON.parse(raw));
  } catch {
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
    const next = normalizeRecords(fn(await readAll()));
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

  return { records, addWorkout, removeWorkout };
}
