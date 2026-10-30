import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { accumulateTrack, advanceSplits, splitDurations, type TrackAccumulator } from './geo';

export type TrackPoint = {
  latitude: number;
  longitude: number;
  timestamp: number;
};

export type WorkoutSummary = {
  startedAt: number;
  distanceMeters: number;
  durationSeconds: number;
  strokeCount: number;
  // 500m 구간마다 걸린 초(끝까지 못 간 마지막 구간은 뺌)
  splits: number[];
};

// starting: 시작·재개를 누르고 GPS가 연결되기를 기다리는 중(이때 또 누르면 위치 구독이 겹쳐 거리가 두 번 더해진다)
export type TrackerStatus = 'idle' | 'starting' | 'tracking' | 'paused' | 'denied';

const EMPTY_TRACK: TrackAccumulator = { distanceMeters: 0, currentSpeed: 0, last: null };

const KEEP_AWAKE_TAG = 'rowing-workout';
const GPS_ERROR = 'GPS를 켜지 못했어요. 위치 서비스가 켜져 있는지 확인하고 다시 눌러 주세요.';

export function useWorkoutTracker() {
  const [status, setStatus] = useState<TrackerStatus>('idle');
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [strokeCount, setStrokeCount] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [splits, setSplits] = useState<number[]>([]);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const pausedAccumRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 거리 누적은 ref에서 한다(상태 updater 안에서 다른 상태를 바꾸면 StrictMode에서 두 번 더해짐).
  const trackRef = useRef<TrackAccumulator>(EMPTY_TRACK);
  const newSegmentRef = useRef(true);
  const strokeCountRef = useRef(0);
  const workoutStartedAtRef = useRef<number | null>(null);
  // 500m 지점별 경과 시간과 직전 점의 (거리, 경과 시간). GPS 점 목록은 쌓지 않는다(긴 운동에서 메모리만 늘던 것).
  const splitMarksRef = useRef<number[]>([]);
  const lastProgressRef = useRef({ distanceMeters: 0, elapsedSeconds: 0 });

  const stopWatch = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const beginSegment = useCallback(async () => {
    newSegmentRef.current = true;
    startedAtRef.current = Date.now();

    subscriptionRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 3, timeInterval: 1000 },
      (loc) => {
        const next: TrackPoint = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          timestamp: loc.timestamp,
        };
        trackRef.current = accumulateTrack(
          trackRef.current,
          { ...next, speed: loc.coords.speed, accuracy: loc.coords.accuracy },
          newSegmentRef.current
        );
        newSegmentRef.current = false;
        const progress = {
          distanceMeters: trackRef.current.distanceMeters,
          elapsedSeconds:
            pausedAccumRef.current +
            (startedAtRef.current ? (Date.now() - startedAtRef.current) / 1000 : 0),
        };
        const marks = advanceSplits(splitMarksRef.current, lastProgressRef.current, progress);
        lastProgressRef.current = progress;
        if (marks !== splitMarksRef.current) {
          splitMarksRef.current = marks;
          setSplits(splitDurations(marks));
        }
        setDistanceMeters(trackRef.current.distanceMeters);
        setCurrentSpeed(trackRef.current.currentSpeed);
      }
    );

    intervalRef.current = setInterval(() => {
      if (startedAtRef.current) {
        setElapsedSeconds(
          pausedAccumRef.current + (Date.now() - startedAtRef.current) / 1000
        );
      }
    }, 1000);

    setStatus('tracking');
  }, []);

  const start = useCallback(async () => {
    setStatus('starting');
    setGpsError(null);
    try {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (permStatus !== 'granted') {
        setStatus('denied');
        return;
      }
    } catch {
      setGpsError(GPS_ERROR);
      setStatus('idle');
      return;
    }

    setSplits([]);
    splitMarksRef.current = [];
    lastProgressRef.current = { distanceMeters: 0, elapsedSeconds: 0 };
    setDistanceMeters(0);
    setElapsedSeconds(0);
    setStrokeCount(0);
    setCurrentSpeed(0);
    trackRef.current = EMPTY_TRACK;
    pausedAccumRef.current = 0;
    strokeCountRef.current = 0;
    workoutStartedAtRef.current = Date.now();

    try {
      await beginSegment();
    } catch {
      // 위치 서비스가 꺼져 있으면 여기로 온다. 시작 대기 화면에 멈춰 있지 않게 처음으로 돌린다.
      startedAtRef.current = null;
      workoutStartedAtRef.current = null;
      setGpsError(GPS_ERROR);
      setStatus('idle');
    }
  }, [beginSegment]);

  const pause = useCallback(() => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    stopWatch();
    if (startedAtRef.current) {
      pausedAccumRef.current += (Date.now() - startedAtRef.current) / 1000;
      startedAtRef.current = null;
    }
    setElapsedSeconds(pausedAccumRef.current);
    setCurrentSpeed(0);
    setStatus('paused');
  }, [stopWatch]);

  const resume = useCallback(async () => {
    setStatus('starting');
    setGpsError(null);
    try {
      await beginSegment();
    } catch {
      // 재개에 실패해도 지금까지의 운동은 일시정지 상태로 남겨 종료·저장할 수 있게 한다.
      startedAtRef.current = null;
      setGpsError(GPS_ERROR);
      setStatus('paused');
    }
  }, [beginSegment]);

  // 끝난 운동 요약을 돌려준다(저장은 화면에서).
  const finish = useCallback((): WorkoutSummary | null => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    stopWatch();
    if (startedAtRef.current) {
      pausedAccumRef.current += (Date.now() - startedAtRef.current) / 1000;
      startedAtRef.current = null;
    }
    setElapsedSeconds(pausedAccumRef.current);
    setCurrentSpeed(0);
    setStatus('idle');
    const workoutStartedAt = workoutStartedAtRef.current;
    workoutStartedAtRef.current = null;
    if (workoutStartedAt == null) return null;
    return {
      startedAt: workoutStartedAt,
      distanceMeters: trackRef.current.distanceMeters,
      durationSeconds: pausedAccumRef.current,
      strokeCount: strokeCountRef.current,
      splits: splitDurations(splitMarksRef.current),
    };
  }, [stopWatch]);

  const logStroke = useCallback(() => {
    strokeCountRef.current += 1;
    setStrokeCount(strokeCountRef.current);
  }, []);

  useEffect(() => {
    return () => {
      subscriptionRef.current?.remove();
      stopWatch();
    };
  }, [stopWatch]);

  // 위치 권한이 '앱 사용 중'뿐이라 화면이 꺼지면 GPS가 멈춘다. 시간은 계속 흘러서 거리가 빠지고
  // 평균 페이스가 느리게 나오므로, 운동 중(일시정지 포함)에는 화면을 켜 둔다.
  const isWorkingOut = status === 'starting' || status === 'tracking' || status === 'paused';
  useEffect(() => {
    if (!isWorkingOut) return;
    // 웹 일부 브라우저는 지원하지 않는다. 화면 켜 두기 실패로 운동을 막지는 않는다.
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [isWorkingOut]);

  const avgSpeed = elapsedSeconds > 0 ? distanceMeters / elapsedSeconds : 0;
  const strokeRate = elapsedSeconds > 0 ? (strokeCount / elapsedSeconds) * 60 : 0;

  return {
    status,
    gpsError,
    splits,
    distanceMeters,
    elapsedSeconds,
    strokeCount,
    currentSpeed,
    avgSpeed,
    strokeRate,
    start,
    pause,
    resume,
    finish,
    logStroke,
  };
}
