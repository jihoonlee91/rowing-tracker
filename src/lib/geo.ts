const EARTH_RADIUS_M = 6371000;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
) {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// 콘셉트2 에르고 화면처럼 m:ss.t (0.1초 단위). 반올림을 먼저 해서 "1:60" 같은 표기가 나오지 않게 한다.
// 500m에 1시간 넘게 걸리는 속도(사실상 정지)는 페이스로 보지 않는다.
export function formatPacePer500m(metersPerSecond: number) {
  if (!Number.isFinite(metersPerSecond) || metersPerSecond <= 0) return '--:--';
  const tenths = Math.round((500 / metersPerSecond) * 10);
  if (tenths >= 36000) return '--:--';
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths % 10}`;
}

export type TrackSample = {
  latitude: number;
  longitude: number;
  timestamp: number;
  // 기기가 준 속도(m/s). 웹·일부 기기는 null.
  speed?: number | null;
};

export type TrackAccumulator = {
  distanceMeters: number;
  currentSpeed: number;
  last: TrackSample | null;
};

// GPS 점 하나를 누적 거리·현재 속도에 반영한다.
// newSegment=true(시작·재개 직후 첫 점)면 직전 점과 잇지 않는다 — 일시정지 동안 움직인 거리는 넣지 않음.
// 0.5m 미만 이동은 GPS 떨림으로 보고 거리에 넣지 않는다.
export function accumulateTrack(
  acc: TrackAccumulator,
  sample: TrackSample,
  newSegment: boolean
): TrackAccumulator {
  const prev = newSegment ? null : acc.last;
  let distanceMeters = acc.distanceMeters;
  let derivedSpeed = 0;
  if (prev) {
    const delta = haversineMeters(prev, sample);
    if (delta > 0.5) distanceMeters += delta;
    const dt = (sample.timestamp - prev.timestamp) / 1000;
    if (dt > 0) derivedSpeed = delta / dt;
  }
  const currentSpeed =
    sample.speed != null && Number.isFinite(sample.speed) && sample.speed >= 0
      ? sample.speed
      : derivedSpeed;
  return { distanceMeters, currentSpeed, last: sample };
}

export function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
