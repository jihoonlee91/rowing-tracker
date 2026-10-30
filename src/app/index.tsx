import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDuration, formatPacePer500m } from '../lib/geo';
import { addWorkout } from '../lib/useWorkoutLog';
import { useWorkoutTracker } from '../lib/useWorkoutTracker';
import { formatErgTime, isWorthSaving } from '../lib/workouts';

export default function TrackerScreen() {
  const tracker = useWorkoutTracker();
  const {
    status,
    gpsError,
    distanceMeters,
    elapsedSeconds,
    strokeCount,
    strokeRate,
    currentSpeed,
    avgSpeed,
    splits,
  } = tracker;

  const [savedNote, setSavedNote] = useState<string | null>(null);

  const isTracking = status === 'tracking';
  const isPaused = status === 'paused';
  const isActive = isTracking || isPaused;

  const start = () => {
    setSavedNote(null);
    tracker.start();
  };

  const finish = async () => {
    const summary = tracker.finish();
    if (!summary) return;
    if (!isWorthSaving(summary.distanceMeters, summary.durationSeconds)) {
      setSavedNote('너무 짧아서 기록에 저장하지 않았어요.');
      return;
    }
    const strokeRate =
      summary.strokeCount > 0 && summary.durationSeconds > 0
        ? (summary.strokeCount / summary.durationSeconds) * 60
        : undefined;
    try {
      await addWorkout({
        source: 'gps',
        startedAt: summary.startedAt,
        distanceMeters: summary.distanceMeters,
        durationSeconds: summary.durationSeconds,
        strokeCount: summary.strokeCount || undefined,
        strokeRate,
        splits: summary.splits.length > 0 ? summary.splits : undefined,
      });
      setSavedNote('기록 탭에 저장했어요.');
    } catch {
      setSavedNote('기록 저장에 실패했어요.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.metricsGrid}>
        <Metric label="거리" value={`${(distanceMeters / 1000).toFixed(2)} km`} big />
        <Metric label="시간" value={formatDuration(elapsedSeconds)} big />
        <Metric label="현재 페이스 /500m" value={formatPacePer500m(currentSpeed)} />
        <Metric label="평균 페이스 /500m" value={formatPacePer500m(avgSpeed)} />
        <Metric label="스트로크" value={`${strokeCount}`} />
        <Metric label="스트로크율 spm" value={strokeRate.toFixed(1)} />
      </View>

      {splits.length > 0 && <SplitList splits={splits} />}

      {status === 'denied' && (
        <Text style={styles.warning}>
          위치 권한이 거부되었어요. 설정에서 위치 접근을 허용해주세요.
        </Text>
      )}

      {gpsError && <Text style={styles.warning}>{gpsError}</Text>}

      {savedNote && !isActive && <Text style={styles.note}>{savedNote}</Text>}

      {isActive && (
        <Pressable style={styles.strokeButton} onPress={tracker.logStroke}>
          <Text style={styles.strokeButtonText}>스트로크 탭</Text>
        </Pressable>
      )}

      <View style={styles.controls}>
        {status === 'idle' || status === 'denied' ? (
          <PrimaryButton label="운동 시작" onPress={start} />
        ) : status === 'starting' ? (
          <View style={[styles.button, styles.buttonSecondary]} accessibilityLiveRegion="polite">
            <Text style={[styles.buttonText, styles.buttonTextSecondary]}>GPS 연결 중…</Text>
          </View>
        ) : isTracking ? (
          <>
            <SecondaryButton label="일시정지" onPress={tracker.pause} />
            <PrimaryButton label="종료" onPress={finish} tone="danger" />
          </>
        ) : (
          <>
            <SecondaryButton label="재개" onPress={tracker.resume} />
            <PrimaryButton label="종료" onPress={finish} tone="danger" />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function Metric({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={styles.metric}>
      <Text style={big ? styles.metricValueBig : styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

// 최근 500m 스플릿(새것이 오른쪽), 가장 빠른 구간은 초록. 오래된 것은 기록 탭에서 전부 보인다.
const SPLITS_SHOWN = 6;

function SplitList({ splits }: { splits: number[] }) {
  const fastest = Math.min(...splits);
  const start = Math.max(0, splits.length - SPLITS_SHOWN);
  return (
    <View
      style={styles.splits}
      accessibilityLabel={`500m 스플릿 ${splits.map((s, i) => `${i + 1}구간 ${formatErgTime(s)}`).join(', ')}`}
    >
      <Text style={styles.metricLabel}>500m 스플릿</Text>
      <View style={styles.splitRow}>
        {splits.slice(start).map((s, i) => (
          <View key={start + i} style={styles.splitChip}>
            <Text style={styles.splitIndex}>{start + i + 1}</Text>
            <Text style={[styles.splitTime, s === fastest && styles.splitFastest]}>{formatErgTime(s)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  tone = 'default',
}: {
  label: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
}) {
  return (
    <Pressable
      style={[styles.button, tone === 'danger' ? styles.buttonDanger : styles.buttonPrimary]}
      onPress={onPress}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={[styles.button, styles.buttonSecondary]} onPress={onPress}>
      <Text style={[styles.buttonText, styles.buttonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1f33',
    padding: 20,
    justifyContent: 'space-between',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  metric: {
    width: '48%',
    backgroundColor: '#122d4a',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  metricValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  metricValueBig: {
    color: '#fff',
    fontSize: 34,
    fontWeight: '800',
  },
  metricLabel: {
    color: '#8fa8c4',
    marginTop: 4,
    fontSize: 13,
  },
  splits: {
    backgroundColor: '#122d4a',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  splitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  splitChip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    backgroundColor: '#1b3a5c',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  splitIndex: {
    color: '#8fa8c4',
    fontSize: 12,
  },
  splitTime: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  splitFastest: {
    color: '#9fd8a8',
  },
  note: {
    color: '#9fd8a8',
    textAlign: 'center',
    marginVertical: 8,
  },
  warning: {
    color: '#ffb4b4',
    textAlign: 'center',
    marginVertical: 8,
  },
  strokeButton: {
    backgroundColor: '#1b3a5c',
    borderRadius: 20,
    paddingVertical: 28,
    alignItems: 'center',
    marginVertical: 12,
  },
  strokeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  controls: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#2f7cf6',
  },
  buttonDanger: {
    backgroundColor: '#e0483e',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#2f7cf6',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonTextSecondary: {
    color: '#2f7cf6',
  },
});
