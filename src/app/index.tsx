import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDuration, formatPacePer500m } from '../lib/geo';
import { useWorkoutTracker } from '../lib/useWorkoutTracker';

export default function TrackerScreen() {
  const tracker = useWorkoutTracker();
  const {
    status,
    distanceMeters,
    elapsedSeconds,
    strokeCount,
    strokeRate,
    currentSpeed,
    avgSpeed,
  } = tracker;

  const isTracking = status === 'tracking';
  const isPaused = status === 'paused';
  const isActive = isTracking || isPaused;

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

      {status === 'denied' && (
        <Text style={styles.warning}>
          위치 권한이 거부되었어요. 설정에서 위치 접근을 허용해주세요.
        </Text>
      )}

      {isActive && (
        <Pressable style={styles.strokeButton} onPress={tracker.logStroke}>
          <Text style={styles.strokeButtonText}>스트로크 탭</Text>
        </Pressable>
      )}

      <View style={styles.controls}>
        {status === 'idle' || status === 'denied' ? (
          <PrimaryButton label="운동 시작" onPress={tracker.start} />
        ) : isTracking ? (
          <>
            <SecondaryButton label="일시정지" onPress={tracker.pause} />
            <PrimaryButton label="종료" onPress={tracker.finish} tone="danger" />
          </>
        ) : (
          <>
            <SecondaryButton label="재개" onPress={tracker.resume} />
            <PrimaryButton label="종료" onPress={tracker.finish} tone="danger" />
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
