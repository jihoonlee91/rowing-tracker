import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

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
};

async function readAll(): Promise<TrainingSession[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as TrainingSession[];
  } catch {
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
      const next = prev.map((s) => (s.id === id ? { ...s, done: !s.done } : s));
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
