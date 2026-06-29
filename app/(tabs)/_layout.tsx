import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShadowVisible: false,
        tabBarActiveTintColor: '#0a84ff',
        tabBarInactiveTintColor: '#737373',
        tabBarStyle: {
          borderTopColor: '#e5e5e5',
          height: Platform.select({ ios: 84, default: 68 }),
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '本棚', tabBarLabel: '本棚' }} />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'スキャン',
          tabBarLabel: '登録',
          tabBarItemStyle: {
            marginTop: -10,
            borderRadius: 24,
          },
        }}
      />
      <Tabs.Screen name="settings" options={{ title: '設定', tabBarLabel: '設定' }} />
    </Tabs>
  );
}
