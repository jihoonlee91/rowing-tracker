import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  SESSION_TYPE_LABEL,
  SessionType,
  TrainingSession,
  WEEKDAYS,
  Weekday,
  useTrainingPlan,
} from '../lib/trainingPlan';

const SESSION_TYPES = Object.keys(SESSION_TYPE_LABEL) as SessionType[];

export default function PlanScreen() {
  const { sessions, addSession, toggleDone, removeSession } = useTrainingPlan();
  const [modalVisible, setModalVisible] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<Weekday, TrainingSession[]>();
    WEEKDAYS.forEach((day) => map.set(day, []));
    (sessions ?? []).forEach((session) => {
      map.get(session.day)?.push(session);
    });
    return map;
  }, [sessions]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.listContent}>
        {WEEKDAYS.map((day) => {
          const daySessions = grouped.get(day) ?? [];
          return (
            <View key={day} style={styles.daySection}>
              <Text style={styles.dayLabel}>{day}요일</Text>
              {daySessions.length === 0 ? (
                <Text style={styles.emptyDay}>계획 없음</Text>
              ) : (
                daySessions.map((session) => (
                  <Pressable
                    key={session.id}
                    style={[styles.card, session.done && styles.cardDone]}
                    onPress={() => toggleDone(session.id)}
                    onLongPress={() => removeSession(session.id)}
                  >
                    <View style={styles.cardRow}>
                      <Ionicons
                        name={session.done ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={session.done ? '#2fbf71' : '#8fa8c4'}
                      />
                      <View style={styles.cardBody}>
                        <Text style={[styles.cardTitle, session.done && styles.cardTitleDone]}>
                          {session.title}
                        </Text>
                        <Text style={styles.cardMeta}>
                          {SESSION_TYPE_LABEL[session.type]}
                          {session.targetDistanceKm ? ` · ${session.targetDistanceKm}km` : ''}
                          {session.targetDurationMin ? ` · ${session.targetDurationMin}분` : ''}
                        </Text>
                        {!!session.notes && <Text style={styles.cardNotes}>{session.notes}</Text>}
                      </View>
                    </View>
                  </Pressable>
                ))
              )}
            </View>
          );
        })}
        <Text style={styles.hint}>길게 눌러서 삭제할 수 있어요.</Text>
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => setModalVisible(true)}>
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      <AddSessionModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSubmit={async (session) => {
          await addSession(session);
          setModalVisible(false);
        }}
      />
    </SafeAreaView>
  );
}

function AddSessionModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (session: Omit<TrainingSession, 'id' | 'done'>) => void;
}) {
  const [day, setDay] = useState<Weekday>('월');
  const [type, setType] = useState<SessionType>('steady');
  const [title, setTitle] = useState('');
  const [distance, setDistance] = useState('');
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');

  const reset = () => {
    setDay('월');
    setType('steady');
    setTitle('');
    setDistance('');
    setDuration('');
    setNotes('');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <ScrollView>
            <Text style={styles.modalTitle}>훈련 세션 추가</Text>

            <Text style={styles.fieldLabel}>요일</Text>
            <View style={styles.chipRow}>
              {WEEKDAYS.map((d) => (
                <Pressable
                  key={d}
                  style={[styles.chip, day === d && styles.chipActive]}
                  onPress={() => setDay(d)}
                >
                  <Text style={[styles.chipText, day === d && styles.chipTextActive]}>{d}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>종류</Text>
            <View style={styles.chipRow}>
              {SESSION_TYPES.map((t) => (
                <Pressable
                  key={t}
                  style={[styles.chip, type === t && styles.chipActive]}
                  onPress={() => setType(t)}
                >
                  <Text style={[styles.chipText, type === t && styles.chipTextActive]}>
                    {SESSION_TYPE_LABEL[t]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>제목</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="예: 저강도 지속주 6km"
              placeholderTextColor="#5b7290"
            />

            <Text style={styles.fieldLabel}>목표 거리 (km)</Text>
            <TextInput
              style={styles.input}
              value={distance}
              onChangeText={setDistance}
              keyboardType="numeric"
              placeholder="선택"
              placeholderTextColor="#5b7290"
            />

            <Text style={styles.fieldLabel}>목표 시간 (분)</Text>
            <TextInput
              style={styles.input}
              value={duration}
              onChangeText={setDuration}
              keyboardType="numeric"
              placeholder="선택"
              placeholderTextColor="#5b7290"
            />

            <Text style={styles.fieldLabel}>메모</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={notes}
              onChangeText={setNotes}
              placeholder="선택"
              placeholderTextColor="#5b7290"
              multiline
            />

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => {
                  reset();
                  onClose();
                }}
              >
                <Text style={styles.modalButtonTextSecondary}>취소</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalButtonPrimary, !title.trim() && styles.modalButtonDisabled]}
                disabled={!title.trim()}
                onPress={() => {
                  onSubmit({
                    day,
                    type,
                    title: title.trim(),
                    targetDistanceKm: distance ? Number(distance) : undefined,
                    targetDurationMin: duration ? Number(duration) : undefined,
                    notes: notes.trim() || undefined,
                  });
                  reset();
                }}
              >
                <Text style={styles.modalButtonText}>저장</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1f33',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  daySection: {
    marginBottom: 20,
  },
  dayLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyDay: {
    color: '#5b7290',
    fontSize: 13,
  },
  card: {
    backgroundColor: '#122d4a',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  cardDone: {
    opacity: 0.5,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  cardTitleDone: {
    textDecorationLine: 'line-through',
  },
  cardMeta: {
    color: '#8fa8c4',
    fontSize: 12,
    marginTop: 2,
  },
  cardNotes: {
    color: '#8fa8c4',
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
  },
  hint: {
    color: '#5b7290',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2f7cf6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#0b1f33',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  fieldLabel: {
    color: '#8fa8c4',
    fontSize: 13,
    marginBottom: 8,
    marginTop: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#122d4a',
  },
  chipActive: {
    backgroundColor: '#2f7cf6',
  },
  chipText: {
    color: '#8fa8c4',
    fontSize: 13,
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#122d4a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
  },
  inputMultiline: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    marginBottom: 8,
  },
  modalButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: '#2f7cf6',
  },
  modalButtonDisabled: {
    opacity: 0.4,
  },
  modalButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#2f7cf6',
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  modalButtonTextSecondary: {
    color: '#2f7cf6',
    fontWeight: '700',
  },
});
