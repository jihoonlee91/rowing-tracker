import { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { csvToRecords, decodeCsvBytes, MAX_IMPORT_BYTES, recordsToCsv } from '../lib/csv';
import { formatDuration, formatPacePer500m } from '../lib/geo';
import { useWorkoutLog } from '../lib/useWorkoutLog';
import {
  avgSpeed,
  cleanNotes,
  concept2Watts,
  ergBests,
  ergPaceTrend,
  formatErgTime,
  NOTES_MAX,
  notesText,
  parseDistance,
  parseDuration,
  trendDistances,
  weeklyDistances,
  weekTotals,
  type WorkoutRecord,
} from '../lib/workouts';

function dateText(ms = Date.now()) {
  const d = new Date(ms);
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
  const { records, addWorkout, removeWorkout, updateWorkout, importWorkouts } = useWorkoutLog();
  const [distance, setDistance] = useState('');
  const [time, setTime] = useState('');
  const [spm, setSpm] = useState('');
  const [date, setDate] = useState(() => dateText());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // 수정 중인 기록과 채워 넣은 처음 값. 처음 값 그대로인 칸은 원래 값을 유지한다
  // (GPS 1234.567m·스트로크율 23.47처럼 화면에서 반올림된 값이 수정 저장 때 바뀌지 않게, 날짜를 안 바꾸면 시각도 유지).
  const [editing, setEditing] = useState<{ record: WorkoutRecord; initial: FormText } | null>(null);
  const listRef = useRef<FlatList<WorkoutRecord>>(null);
  const formY = useRef(0);

  const week = useMemo(() => weekTotals(records ?? []), [records]);
  const weeks = useMemo(() => weeklyDistances(records ?? [], 8), [records]);
  const bests = useMemo(() => ergBests(records ?? []), [records]);

  const trendOptions = useMemo(() => trendDistances(records ?? []), [records]);

  const distanceM = parseDistance(distance) ?? 0;
  const seconds = parseDuration(time);
  const preview =
    distanceM > 0 && seconds
      ? `${formatPacePer500m(distanceM / seconds)} /500m · ${Math.round(concept2Watts(distanceM, seconds))} W`
      : null;

  const resetForm = () => {
    setDistance('');
    setTime('');
    setSpm('');
    setDate(dateText());
    setNotes('');
  };

  const startEdit = (record: WorkoutRecord) => {
    const initial = recordToForm(record);
    setEditing({ record, initial });
    setDistance(initial.distance);
    setTime(initial.time);
    setSpm(initial.spm);
    setDate(initial.date);
    setNotes(initial.notes);
    setError(null);
    setConfirmId(null);
    listRef.current?.scrollToOffset({ offset: formY.current, animated: true });
  };

  const cancelEdit = () => {
    setEditing(null);
    setError(null);
    resetForm();
  };

  const submit = async () => {
    if (!(distanceM > 0)) return setError('거리를 2000 또는 2k처럼 입력해주세요.');
    if (!seconds) return setError('시간을 7:30.5 또는 1:02:03처럼 입력해주세요.');
    const startedAt = parseDate(date);
    if (startedAt == null) return setError('날짜를 2026-10-14처럼 입력해주세요(미래 날짜는 안 돼요).');
    const rate = spm.trim() ? Number(spm.replace(',', '.')) : 0;
    // 수정 때 안 건드린 spm은 검사하지 않는다(트래커가 저장한 5 spm 같은 값 때문에 다른 칸을 못 고치지 않게).
    const spmUntouched = editing != null && spm.trim() === editing.initial.spm;
    if (spm.trim() && !spmUntouched && !(rate >= 10 && rate <= 60)) return setError('평균 spm은 10~60 사이로 입력해주세요(비워도 돼요).');
    setError(null);
    try {
      if (editing) {
        const { record, initial } = editing;
        const changed = (now: string, before: string) => now.trim() !== before;
        await updateWorkout(record.id, {
          distanceMeters: changed(distance, initial.distance) ? distanceM : undefined,
          durationSeconds: changed(time, initial.time) ? seconds : undefined,
          startedAt: changed(date, initial.date) ? startedAt : undefined,
          strokeRate: changed(spm, initial.spm) ? (rate > 0 ? rate : null) : undefined,
          notes: changed(notes, initial.notes) ? cleanNotes(notes) : undefined,
        });
        setEditing(null);
      } else {
        await addWorkout({
          source: 'erg',
          startedAt,
          distanceMeters: distanceM,
          durationSeconds: seconds,
          strokeRate: rate > 0 ? rate : undefined,
          notes: cleanNotes(notes) ?? undefined,
        });
      }
      // 새 기록 입력은 날짜를 그대로 둔다(같은 날 여러 개 입력). 수정이 끝나면 오늘로.
      if (editing) resetForm();
      else {
        setDistance('');
        setTime('');
        setSpm('');
        setNotes('');
      }
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

              {trendOptions.length > 0 && <PaceTrendCard records={records ?? []} options={trendOptions} />}

              <View
                style={[styles.form, editing && styles.formEditing]}
                onLayout={(e) => {
                  formY.current = e.nativeEvent.layout.y;
                }}
              >
                <Text style={styles.formTitle}>
                  {editing
                    ? `기록 수정 · ${formatDate(editing.record.startedAt)} ${editing.record.source === 'erg' ? '에르고' : '수상(GPS)'}`
                    : '에르고 기록 입력'}
                </Text>
                <View style={styles.row}>
                  <Field label="거리 (m, 2k도 돼요)" value={distance} onChange={setDistance} placeholder="2000" />
                  <Field label="시간" value={time} onChange={setTime} placeholder="7:30.5" />
                </View>
                <View style={styles.row}>
                  <Field label="평균 spm (선택)" value={spm} onChange={setSpm} placeholder="24" numeric />
                  <Field label="날짜" value={date} onChange={setDate} placeholder="2026-10-14" />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>메모 (선택)</Text>
                  <TextInput
                    style={[styles.input, styles.notesInput]}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="4×500m 인터벌, 컨디션 좋음"
                    placeholderTextColor="#5d7896"
                    multiline
                    maxLength={NOTES_MAX}
                    accessibilityLabel="메모 (선택)"
                  />
                </View>
                {preview && <Text style={styles.preview}>{preview}</Text>}
                {error && <Text style={styles.error}>{error}</Text>}
                <View style={styles.row}>
                  {editing && (
                    <Pressable style={styles.secondaryButton} onPress={cancelEdit} accessibilityRole="button">
                      <Text style={styles.secondaryButtonText}>취소</Text>
                    </Pressable>
                  )}
                  <Pressable style={[styles.saveButton, { flex: 1 }]} onPress={submit} accessibilityRole="button">
                    <Text style={styles.saveButtonText}>{editing ? '수정 저장' : '저장'}</Text>
                  </Pressable>
                </View>
              </View>

              <Text style={styles.sectionTitle}>기록</Text>
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {records ? '아직 기록이 없어요. 트래커에서 운동을 마치거나 에르고 기록을 입력하세요.' : '불러오는 중…'}
            </Text>
          }
          ListFooterComponent={<BackupCard records={records ?? []} onImport={importWorkouts} />}
          renderItem={({ item }) => (
            <RecordRow
              record={item}
              confirming={confirmId === item.id}
              editing={editing?.record.id === item.id}
              onEdit={() => startEdit(item)}
              onDelete={() => {
                if (confirmId === item.id) {
                  setConfirmId(null);
                  if (editing?.record.id === item.id) cancelEdit();
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

// 같은 표준 거리 에르고 기록의 /500m 페이스 추이(점 그래프, 빠를수록 위). 거리는 칩으로 고른다.
function PaceTrendCard({ records, options }: { records: WorkoutRecord[]; options: number[] }) {
  const [picked, setPicked] = useState<number | null>(null);
  const dist = picked != null && options.includes(picked) ? picked : options.includes(2000) ? 2000 : options[0];
  const points = useMemo(() => ergPaceTrend(records, dist), [records, dist]);
  const paces = points.map((p) => p.paceSeconds);
  const fast = Math.min(...paces);
  const slow = Math.max(...paces);
  const range = slow - fast;
  const first = points[0];
  const last = points[points.length - 1];
  const diff = last.paceSeconds - first.paceSeconds;
  const change =
    Math.abs(diff) < 0.05
      ? '첫 기록과 같은 페이스'
      : `첫 기록보다 ${Math.abs(diff).toFixed(1)}초 ${diff < 0 ? '빠름' : '느림'}`;
  const label = (d: number) => (d >= 1000 ? `${d / 1000}k` : `${d}m`);
  const pace = (s: number) => formatPacePer500m(500 / s);
  return (
    <View style={styles.weekCard}>
      <Text style={styles.weekLabel}>에르고 페이스 추이 (/500m)</Text>
      <View style={styles.chipRow}>
        {options.map((d) => (
          <Pressable
            key={d}
            onPress={() => setPicked(d)}
            style={[styles.chip, d === dist && styles.chipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: d === dist }}
          >
            <Text style={[styles.chipText, d === dist && styles.chipTextOn]}>{label(d)}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.trendSummary}>
        최근 {pace(last.paceSeconds)} · {change}
      </Text>
      <View
        style={styles.chart}
        accessible
        accessibilityLabel={`${label(dist)} 페이스 추이: ${points
          .map((p) => `${formatShortDate(p.startedAt)} ${pace(p.paceSeconds)}`)
          .join(', ')}`}
      >
        {points.map((p, i) => {
          // 가장 빠른 기록이 위(92%), 가장 느린 기록이 아래(8%). 모두 같으면 가운데.
          const y = range > 0 ? 8 + ((slow - p.paceSeconds) / range) * 84 : 50;
          const isBest = p.paceSeconds === fast;
          return (
            <View key={p.id} style={styles.chartCol}>
              <View style={styles.chartTrack}>
                <View style={[styles.dot, { bottom: `${y}%` }, isBest && styles.dotBest]} />
              </View>
              <Text style={styles.chartLabel} numberOfLines={1}>
                {i === 0 || i === points.length - 1 || points.length <= 6 ? formatShortDate(p.startedAt) : ''}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.chartLabel}>
        가장 빠름 {pace(fast)} · 가장 느림 {pace(slow)} · {points.length}회
      </Text>
    </View>
  );
}

// 기록 백업(CSV 내보내기)과 가져오기(이 앱 CSV 또는 콘셉트2 로그북 CSV를 붙여넣기).
function BackupCard({
  records,
  onImport,
}: {
  records: WorkoutRecord[];
  onImport: (records: WorkoutRecord[]) => Promise<number>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const exportCsv = async () => {
    const csv = recordsToCsv(records);
    const d = new Date();
    const name = `rowing-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.csv`;
    try {
      if (Platform.OS === 'web') {
        // 엑셀에서 한글이 깨지지 않게 BOM을 붙인다(가져오기는 BOM을 무시).
        const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        await Share.share({ title: name, message: csv });
      }
      setMessage(`${records.length}개 기록을 CSV로 내보냈어요.`);
    } catch {
      setMessage('내보내기에 실패했어요.');
    }
  };

  const importCsv = async (source: string, fromFile = false) => {
    const parsed = csvToRecords(source);
    if (!parsed.format) {
      setMessage(
        fromFile
          ? '읽을 수 있는 CSV 파일이 아니에요. 이 앱에서 내보낸 CSV나 콘셉트2 로그북 CSV를 골라 주세요.'
          : '읽을 수 있는 CSV가 아니에요. 이 앱에서 내보낸 CSV나 콘셉트2 로그북 CSV를 붙여넣어 주세요.'
      );
      return;
    }
    try {
      const added = await onImport(parsed.records);
      const dup = parsed.records.length - added;
      setMessage(
        `${added}개 가져옴` +
          (dup > 0 ? ` · 이미 있는 ${dup}개 건너뜀` : '') +
          (parsed.skipped > 0 ? ` · ${parsed.skipped}줄 제외(형식 오류·RowErg 아님)` : '')
      );
      if (!fromFile && (added > 0 || dup > 0)) setText('');
    } catch {
      setMessage('가져오기에 실패했어요(기존 기록은 그대로예요).');
    }
  };

  // 웹: 콘셉트2 로그북에서 내려받은 CSV 파일을 바로 고른다(열어서 복사·붙여넣기 하지 않게).
  // 폰은 파일 선택에 새 네이티브 모듈이 필요해 붙여넣기만 둔다.
  const pickFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > MAX_IMPORT_BYTES) {
        setMessage('파일이 너무 커요(5MB 넘음). CSV 파일이 맞는지 확인해 주세요.');
        return;
      }
      try {
        const source = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
        await importCsv(source, true);
      } catch {
        setMessage('파일을 읽지 못했어요(기존 기록은 그대로예요).');
      }
    };
    input.click();
  };

  return (
    <View style={[styles.form, { marginTop: 8 }]}>
      <Text style={styles.formTitle}>백업 · 가져오기</Text>
      <View style={styles.row}>
        <Pressable
          style={[styles.secondaryButton, records.length === 0 && { opacity: 0.5 }]}
          onPress={exportCsv}
          disabled={records.length === 0}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>CSV 내보내기</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
        >
          <Text style={styles.secondaryButtonText}>{open ? '가져오기 닫기' : 'CSV 가져오기'}</Text>
        </Pressable>
      </View>
      {open && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.fieldLabel}>
            이 앱에서 내보낸 CSV, 또는 콘셉트2 로그북(log.concept2.com)에서 내려받은 CSV를{' '}
            {Platform.OS === 'web' ? '파일로 고르거나 내용을 붙여넣으세요' : '내용을 붙여넣으세요'}. 이미 있는 기록은 건너뜁니다.
          </Text>
          {Platform.OS === 'web' && (
            <View style={[styles.row, { marginTop: 10 }]}>
              <Pressable style={styles.secondaryButton} onPress={pickFile} accessibilityRole="button">
                <Text style={styles.secondaryButtonText}>CSV 파일 고르기</Text>
              </Pressable>
            </View>
          )}
          <TextInput
            style={[styles.input, styles.csvInput]}
            value={text}
            onChangeText={setText}
            multiline
            placeholder="date,source,distance_m,time_s,…"
            placeholderTextColor="#5d7896"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="가져올 CSV"
          />
          <Pressable
            style={[styles.saveButton, !text.trim() && { opacity: 0.5 }]}
            onPress={() => importCsv(text)}
            disabled={!text.trim()}
            accessibilityRole="button"
          >
            <Text style={styles.saveButtonText}>가져오기</Text>
          </Pressable>
        </View>
      )}
      {message && <Text style={[styles.preview, { marginTop: 8, marginBottom: 0 }]}>{message}</Text>}
    </View>
  );
}

function formatShortDate(ms: number) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

type FormText = { distance: string; time: string; spm: string; date: string; notes: string };

// 기록 → 입력 칸 글자(수정 창에 채울 값)
function recordToForm(r: WorkoutRecord): FormText {
  return {
    distance: String(Math.round(r.distanceMeters * 10) / 10),
    time: formatErgTime(r.durationSeconds),
    spm: r.strokeRate ? String(Math.round(r.strokeRate * 10) / 10) : '',
    date: dateText(r.startedAt),
    notes: notesText(r),
  };
}

function RecordRow({
  record,
  confirming,
  editing,
  onEdit,
  onDelete,
}: {
  record: WorkoutRecord;
  confirming: boolean;
  editing: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isErg = record.source === 'erg';
  const details = [
    `${formatPacePer500m(avgSpeed(record))} /500m`,
    isErg ? `${Math.round(concept2Watts(record.distanceMeters, record.durationSeconds))} W` : null,
    record.strokeRate ? `${record.strokeRate.toFixed(0)} spm` : null,
  ].filter(Boolean);
  const memo = notesText(record);
  return (
    <View style={[styles.record, editing && styles.recordEditing]}>
      <Pressable
        style={{ flex: 1 }}
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={`${formatDate(record.startedAt)} 기록 수정`}
      >
        <Text style={styles.recordTitle}>
          {formatDate(record.startedAt)} · {isErg ? '에르고' : '수상(GPS)'}
        </Text>
        <Text style={styles.recordMain}>
          {Math.round(record.distanceMeters).toLocaleString()} m ·{' '}
          {isErg ? formatErgTime(record.durationSeconds) : formatDuration(record.durationSeconds)}
        </Text>
        <Text style={styles.recordSub}>{details.join(' · ')}</Text>
        {!!memo && (
          <Text style={styles.recordNotes} numberOfLines={2}>
            {memo}
          </Text>
        )}
      </Pressable>
      <Pressable onPress={onEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel="수정">
        <Text style={styles.delete}>수정</Text>
      </Pressable>
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { borderWidth: 1, borderColor: '#3b6ea5', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: '#2f7cf6', borderColor: '#2f7cf6' },
  chipText: { color: '#c7d6e6', fontSize: 13 },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  trendSummary: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 10 },
  dot: {
    position: 'absolute',
    alignSelf: 'center',
    width: 10,
    height: 10,
    marginBottom: -5,
    borderRadius: 5,
    backgroundColor: '#3b6ea5',
  },
  dotBest: { backgroundColor: '#9fd8a8' },
  bestRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 8, gap: 10 },
  bestDist: { color: '#8fa8c4', fontSize: 14, width: 44 },
  bestTime: { color: '#fff', fontSize: 18, fontWeight: '700' },
  bestSub: { color: '#c7d6e6', fontSize: 12, flexShrink: 1 },
  form: { backgroundColor: '#122d4a', borderRadius: 16, padding: 16, marginBottom: 16 },
  formEditing: { borderWidth: 1, borderColor: '#2f7cf6' },
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
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#3b6ea5',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#c7d6e6', fontSize: 15, fontWeight: '600' },
  csvInput: { minHeight: 120, maxHeight: 240, marginVertical: 10, fontSize: 13, textAlignVertical: 'top' },
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
  recordEditing: { borderWidth: 1, borderColor: '#2f7cf6' },
  recordTitle: { color: '#8fa8c4', fontSize: 13 },
  recordMain: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 2 },
  recordSub: { color: '#c7d6e6', fontSize: 13, marginTop: 2 },
  recordNotes: { color: '#8fa8c4', fontSize: 13, marginTop: 4, fontStyle: 'italic' },
  notesInput: { minHeight: 44, maxHeight: 120, textAlignVertical: 'top' },
  delete: { color: '#8fa8c4', fontSize: 14, paddingLeft: 12 },
  deleteConfirm: { color: '#ff6b61', fontSize: 14, fontWeight: '700', paddingLeft: 12 },
});
