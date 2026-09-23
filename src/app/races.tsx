import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchRowingEvents, RaceEvent } from '../lib/raceHub';

const STATUS_LABEL: Record<RaceEvent['registrationStatus'], string> = {
  open: '접수중',
  upcoming: '접수예정',
  closed: '접수마감',
};

const STATUS_COLOR: Record<RaceEvent['registrationStatus'], string> = {
  open: '#2fbf71',
  upcoming: '#f2b134',
  closed: '#6b7a8f',
};

export default function RacesScreen() {
  const [events, setEvents] = useState<RaceEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchRowingEvents();
      setEvents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '대회 정보를 불러오지 못했어요.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (events === null && !error) {
    return (
      <SafeAreaView style={styles.centered} edges={['bottom']}>
        <ActivityIndicator color="#2f7cf6" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.centered} edges={['bottom']}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={load}>
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={events ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>현재 등록된 조정 대회 정보가 없어요.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => Linking.openURL(item.linkVerified ? item.applyUrl : item.sourceUrl)}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <View style={[styles.badge, { backgroundColor: STATUS_COLOR[item.registrationStatus] }]}>
                <Text style={styles.badgeText}>{STATUS_LABEL[item.registrationStatus]}</Text>
              </View>
            </View>
            <Text style={styles.cardMeta}>
              {item.date}
              {item.city ? ` · ${item.city}` : ''}
            </Text>
            {item.distances.length > 0 && (
              <Text style={styles.cardMeta}>{item.distances.join(' / ')}</Text>
            )}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1f33',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#122d4a',
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  cardMeta: {
    color: '#8fa8c4',
    fontSize: 13,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  errorText: {
    color: '#ffb4b4',
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyText: {
    color: '#8fa8c4',
  },
  retryButton: {
    backgroundColor: '#2f7cf6',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
