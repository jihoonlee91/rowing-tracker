import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { haversineMeters } from './geo';

export type TrackPoint = {
  latitude: number;
  longitude: number;
  timestamp: number;
};

export type TrackerStatus = 'idle' | 'requesting-permission' | 'tracking' | 'paused' | 'denied';

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

  const stopWatch = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
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
    startedAtRef.current = Date.now();
    pausedAccumRef.current = 0;

    subscriptionRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 3, timeInterval: 1000 },
      (loc) => {
        const next: TrackPoint = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          timestamp: loc.timestamp,
        };
        setCurrentSpeed(loc.coords.speed && loc.coords.speed > 0 ? loc.coords.speed : 0);
        setPoints((prev) => {
          if (prev.length > 0) {
            const last = prev[prev.length - 1];
            const delta = haversineMeters(last, next);
            if (delta > 0.5) {
              setDistanceMeters((d) => d + delta);
            }
          }
          return [...prev, next];
        });
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

  const pause = useCallback(() => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    stopWatch();
    if (startedAtRef.current) {
      pausedAccumRef.current += (Date.now() - startedAtRef.current) / 1000;
      startedAtRef.current = null;
    }
    setStatus('paused');
  }, [stopWatch]);

  const resume = useCallback(async () => {
    startedAtRef.current = Date.now();
    subscriptionRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 3, timeInterval: 1000 },
      (loc) => {
        const next: TrackPoint = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          timestamp: loc.timestamp,
        };
        setCurrentSpeed(loc.coords.speed && loc.coords.speed > 0 ? loc.coords.speed : 0);
        setPoints((prev) => {
          if (prev.length > 0) {
            const last = prev[prev.length - 1];
            const delta = haversineMeters(last, next);
            if (delta > 0.5) {
              setDistanceMeters((d) => d + delta);
            }
          }
          return [...prev, next];
        });
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

  const finish = useCallback(() => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    stopWatch();
    startedAtRef.current = null;
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
