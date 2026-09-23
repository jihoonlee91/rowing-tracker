import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

export default function RootLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#2f7cf6',
        headerStyle: { backgroundColor: '#0b1f33' },
        headerTintColor: '#fff',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '트래커',
          tabBarIcon: ({ color, size }) => <Ionicons name="stopwatch" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="races"
        options={{
          title: '대회',
          tabBarIcon: ({ color, size }) => <Ionicons name="trophy" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: '훈련계획',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
