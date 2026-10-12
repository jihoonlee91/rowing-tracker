import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { accumulateTrack, type TrackAccumulator } from './geo';

export type TrackPoint = {
  latitude: number;
  longitude: number;
  timestamp: number;
};

export type TrackerStatus = 'idle' | 'requesting-permission' | 'tracking' | 'paused' | 'denied';

const EMPTY_TRACK: TrackAccumulator = { distanceMeters: 0, currentSpeed: 0, last: null };

export function useWorkoutTracker() {
  const [status, setStatus] = useState<TrackerStatus>('idle');
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [strokeCount, setStrokeCount] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);

  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const pausedAccumRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 거리 누적은 ref에서 한다(상태 updater 안에서 다른 상태를 바꾸면 StrictMode에서 두 번 더해짐).
  const trackRef = useRef<TrackAccumulator>(EMPTY_TRACK);
  const newSegmentRef = useRef(true);

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
          { ...next, speed: loc.coords.speed },
          newSegmentRef.current
        );
        newSegmentRef.current = false;
        setDistanceMeters(trackRef.current.distanceMeters);
        setCurrentSpeed(trackRef.current.currentSpeed);
        setPoints((prev) => [...prev, next]);
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
    setStatus('requesting-permission');
    const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
    if (permStatus !== 'granted') {
      setStatus('denied');
      return;
    }

    setPoints([]);
    setDistanceMeters(0);
    setElapsedSeconds(0);
    setStrokeCount(0);
    setCurrentSpeed(0);
    trackRef.current = EMPTY_TRACK;
    pausedAccumRef.current = 0;

    await beginSegment();
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
    await beginSegment();
  }, [beginSegment]);

  const finish = useCallback(() => {
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
  }, [stopWatch]);

  const logStroke = useCallback(() => {
    setStrokeCount((c) => c + 1);
  }, []);

  useEffect(() => {
    return () => {
      subscriptionRef.current?.remove();
      stopWatch();
    };
  }, [stopWatch]);

  const avgSpeed = elapsedSeconds > 0 ? distanceMeters / elapsedSeconds : 0;
  const strokeRate = elapsedSeconds > 0 ? (strokeCount / elapsedSeconds) * 60 : 0;

  return {
    status,
    points,
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
