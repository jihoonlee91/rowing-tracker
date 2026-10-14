import { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDuration, formatPacePer500m } from '../lib/geo';
import { useWorkoutLog } from '../lib/useWorkoutLog';
import {
  avgSpeed,
  concept2Watts,
  ergBests,
  formatErgTime,
  parseDuration,
  weeklyDistances,
  weekTotals,
  type WorkoutRecord,
} from '../lib/workouts';

function todayText() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// "2026-10-14" → 그날 정오(기기 시간대, 오늘이면 지금 시각 — 아직 오지 않은 시각이면 이번 주 합계에서 빠짐).
// 형식이 틀리거나 미래 날짜면 null.
function parseDate(text: string): number | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  if (d.getMonth() !== Number(m[2]) - 1) return null;
  const now = Date.now();
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (dayStart > now) return null;
  return Math.min(d.getTime(), now);
}

function formatDate(ms: number) {
  const d = new Date(ms);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`;
}

export default function LogScreen() {
  const { records, addWorkout, removeWorkout } = useWorkoutLog();
  const [distance, setDistance] = useState('');
  const [time, setTime] = useState('');
  const [spm, setSpm] = useState('');
  const [date, setDate] = useState(todayText);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const week = useMemo(() => weekTotals(records ?? []), [records]);
  const weeks = useMemo(() => weeklyDistances(records ?? [], 8), [records]);
  const bests = useMemo(() => ergBests(records ?? []), [records]);

  const distanceM = Number(distance);
  const seconds = parseDuration(time);
  const preview =
    distanceM > 0 && seconds
      ? `${formatPacePer500m(distanceM / seconds)} /500m · ${Math.round(concept2Watts(distanceM, seconds))} W`
      : null;

  const submit = async () => {
    if (!(distanceM > 0)) return setError('거리(m)를 입력해주세요.');
    if (!seconds) return setError('시간을 7:30.5 또는 1:02:03처럼 입력해주세요.');
    const startedAt = parseDate(date);
    if (startedAt == null) return setError('날짜를 2026-10-14처럼 입력해주세요(미래 날짜는 안 돼요).');
    const rate = Number(spm);
    setError(null);
    try {
      await addWorkout({
        source: 'erg',
        startedAt,
        distanceMeters: distanceM,
        durationSeconds: seconds,
        strokeRate: rate > 0 ? rate : undefined,
      });
      setDistance('');
      setTime('');
      setSpm('');
    } catch {
      setError('저장에 실패했어요.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={records ?? []}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              <View style={styles.weekCard}>
                <Text style={styles.weekLabel}>이번 주</Text>
                <Text style={styles.weekValue}>
                  {(week.distanceMeters / 1000).toFixed(1)} km · {formatDuration(week.durationSeconds)} ·{' '}
                  {week.count}회
                </Text>
                {weeks.some((w) => w.count > 0) && <WeeklyChart weeks={weeks} />}
              </View>

              {bests.length > 0 && (
                <View style={styles.weekCard}>
                  <Text style={styles.weekLabel}>에르고 최고 기록</Text>
                  {bests.map((b) => (
                    <View key={b.distanceMeters} style={styles.bestRow}>
                      <Text style={styles.bestDist}>
                        {b.distanceMeters >= 1000 ? `${b.distanceMeters / 1000}k` : `${b.distanceMeters}m`}
                      </Text>
                      <Text style={styles.bestTime}>{formatErgTime(b.durationSeconds)}</Text>
                      <Text style={styles.bestSub}>
                        {formatPacePer500m(avgSpeed(b))} /500m · {formatDate(b.startedAt)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.form}>
                <Text style={styles.formTitle}>에르고 기록 입력</Text>
                <View style={styles.row}>
                  <Field label="거리 (m)" value={distance} onChange={setDistance} placeholder="2000" numeric />
                  <Field label="시간" value={time} onChange={setTime} placeholder="7:30.5" />
                </View>
                <View style={styles.row}>
                  <Field label="평균 spm (선택)" value={spm} onChange={setSpm} placeholder="24" numeric />
                  <Field label="날짜" value={date} onChange={setDate} placeholder="2026-10-14" />
                </View>
                {preview && <Text style={styles.preview}>{preview}</Text>}
                {error && <Text style={styles.error}>{error}</Text>}
                <Pressable style={styles.saveButton} onPress={submit} accessibilityRole="button">
                  <Text style={styles.saveButtonText}>저장</Text>
                </Pressable>
              </View>

              <Text style={styles.sectionTitle}>기록</Text>
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {records ? '아직 기록이 없어요. 트래커에서 운동을 마치거나 에르고 기록을 입력하세요.' : '불러오는 중…'}
            </Text>
          }
          renderItem={({ item }) => (
            <RecordRow
              record={item}
              confirming={confirmId === item.id}
              onDelete={() => {
                if (confirmId === item.id) {
                  setConfirmId(null);
                  removeWorkout(item.id);
                } else {
                  setConfirmId(item.id);
                }
              }}
            />
          )}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// 최근 8주 주별 거리 막대(라이브러리 없이 View로). 막대 위는 km, 아래는 그 주 월요일 날짜.
function WeeklyChart({ weeks }: { weeks: { weekStart: number; distanceMeters: number; count: number }[] }) {
  const max = Math.max(...weeks.map((w) => w.distanceMeters), 1);
  const summary = weeks
    .map((w) => `${formatShortDate(w.weekStart)} 주 ${(w.distanceMeters / 1000).toFixed(1)}km`)
    .join(', ');
  return (
    <View style={styles.chart} accessible accessibilityLabel={`최근 8주 거리: ${summary}`}>
      {weeks.map((w, i) => {
        const km = w.distanceMeters / 1000;
        const isThisWeek = i === weeks.length - 1;
        return (
          <View key={w.weekStart} style={styles.chartCol}>
            <Text style={styles.chartValue} numberOfLines={1}>
              {w.distanceMeters > 0 ? (km >= 10 ? km.toFixed(0) : km.toFixed(1)) : ''}
            </Text>
            <View style={styles.chartTrack}>
              <View
                style={[
                  styles.chartBar,
                  { height: `${Math.max((w.distanceMeters / max) * 100, w.distanceMeters > 0 ? 4 : 0)}%` },
                  isThisWeek && styles.chartBarNow,
                ]}
              />
            </View>
            <Text style={styles.chartLabel} numberOfLines={1}>
              {formatShortDate(w.weekStart)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function formatShortDate(ms: number) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function RecordRow({
  record,
  confirming,
  onDelete,
}: {
  record: WorkoutRecord;
  confirming: boolean;
  onDelete: () => void;
}) {
  const isErg = record.source === 'erg';
  const details = [
    `${formatPacePer500m(avgSpeed(record))} /500m`,
    isErg ? `${Math.round(concept2Watts(record.distanceMeters, record.durationSeconds))} W` : null,
    record.strokeRate ? `${record.strokeRate.toFixed(0)} spm` : null,
  ].filter(Boolean);
  return (
    <View style={styles.record}>
      <View style={{ flex: 1 }}>
        <Text style={styles.recordTitle}>
          {formatDate(record.startedAt)} · {isErg ? '에르고' : '수상(GPS)'}
        </Text>
        <Text style={styles.recordMain}>
          {Math.round(record.distanceMeters).toLocaleString()} m ·{' '}
          {isErg ? formatErgTime(record.durationSeconds) : formatDuration(record.durationSeconds)}
        </Text>
        <Text style={styles.recordSub}>{details.join(' · ')}</Text>
      </View>
      <Pressable onPress={onDelete} hitSlop={8} accessibilityRole="button">
        <Text style={confirming ? styles.deleteConfirm : styles.delete}>
          {confirming ? '삭제?' : '삭제'}
        </Text>
      </Pressable>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  numeric,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  numeric?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#5d7896"
        keyboardType={numeric ? 'numeric' : 'numbers-and-punctuation'}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1f33' },
  list: { padding: 16, paddingBottom: 32 },
  weekCard: { backgroundColor: '#122d4a', borderRadius: 16, padding: 16, marginBottom: 12 },
  weekLabel: { color: '#8fa8c4', fontSize: 13 },
  weekValue: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 4 },
  chart: { flexDirection: 'row', gap: 4, marginTop: 12, height: 120 },
  chartCol: { flex: 1, alignItems: 'center', minWidth: 0 },
  chartValue: { color: '#c7d6e6', fontSize: 10, height: 14 },
  chartTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  chartBar: { backgroundColor: '#3b6ea5', borderRadius: 4, width: '100%' },
  chartBarNow: { backgroundColor: '#2f7cf6' },
  chartLabel: { color: '#8fa8c4', fontSize: 10, marginTop: 4 },
  bestRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 8, gap: 10 },
  bestDist: { color: '#8fa8c4', fontSize: 14, width: 44 },
  bestTime: { color: '#fff', fontSize: 18, fontWeight: '700' },
  bestSub: { color: '#c7d6e6', fontSize: 12, flexShrink: 1 },
  form: { backgroundColor: '#122d4a', borderRadius: 16, padding: 16, marginBottom: 16 },
  formTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 10 },
  field: { flex: 1, marginBottom: 10 },
  fieldLabel: { color: '#8fa8c4', fontSize: 12, marginBottom: 4 },
  input: {
    backgroundColor: '#0b1f33',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    minWidth: 0,
  },
  preview: { color: '#9fd8a8', marginBottom: 8 },
  error: { color: '#ffb4b4', marginBottom: 8 },
  saveButton: { backgroundColor: '#2f7cf6', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  empty: { color: '#8fa8c4', textAlign: 'center', marginTop: 16 },
  record: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#122d4a',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  recordTitle: { color: '#8fa8c4', fontSize: 13 },
  recordMain: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 2 },
  recordSub: { color: '#c7d6e6', fontSize: 13, marginTop: 2 },
  delete: { color: '#8fa8c4', fontSize: 14, paddingLeft: 12 },
  deleteConfirm: { color: '#ff6b61', fontSize: 14, fontWeight: '700', paddingLeft: 12 },
});
