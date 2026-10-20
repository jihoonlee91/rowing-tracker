import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { isDoneThisWeek, normalizeSessions } from './planWeek';

const STORAGE_KEY = 'rowing-tracker:training-plan:v1';

export type SessionType = 'steady' | 'interval' | 'technique' | 'erg' | 'rest';

export const SESSION_TYPE_LABEL: Record<SessionType, string> = {
  steady: '지속주 (Steady State)',
  interval: '인터벌',
  technique: '기술 훈련',
  erg: '에르고미터',
  rest: '휴식',
};

export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type TrainingSession = {
  id: string;
  day: Weekday;
  type: SessionType;
  title: string;
  targetDistanceKm?: number;
  targetDurationMin?: number;
  notes?: string;
  done: boolean;
  // 완료로 체크한 시각(epoch ms). 그 주에만 완료로 보인다. 이전 형식에는 없다.
  doneAt?: number;
};

async function readAll(): Promise<TrainingSession[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return normalizeSessions(JSON.parse(raw));
  } catch {
    // 깨진 원본은 다음 저장이 덮어쓰기 전에 따로 보관한다.
    await AsyncStorage.setItem(`${STORAGE_KEY}:broken-${Date.now()}`, raw);
    return [];
  }
}

async function writeAll(sessions: TrainingSession[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function useTrainingPlan() {
  const [sessions, setSessions] = useState<TrainingSession[] | null>(null);

  useEffect(() => {
    readAll().then(setSessions);
  }, []);

  const addSession = useCallback(async (session: Omit<TrainingSession, 'id' | 'done'>) => {
    setSessions((prev) => {
      const current = prev ?? [];
      const next: TrainingSession[] = [
        ...current,
        { ...session, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, done: false },
      ];
      writeAll(next);
      return next;
    });
  }, []);

  const toggleDone = useCallback(async (id: string) => {
    setSessions((prev) => {
      if (!prev) return prev;
      const next = prev.map((s) =>
        s.id === id
          ? isDoneThisWeek(s)
            ? { ...s, done: false, doneAt: undefined }
            : { ...s, done: true, doneAt: Date.now() }
          : s
      );
      writeAll(next);
      return next;
    });
  }, []);

  const removeSession = useCallback(async (id: string) => {
    setSessions((prev) => {
      if (!prev) return prev;
      const next = prev.filter((s) => s.id !== id);
      writeAll(next);
      return next;
    });
  }, []);

  return { sessions, addSession, toggleDone, removeSession };
}
