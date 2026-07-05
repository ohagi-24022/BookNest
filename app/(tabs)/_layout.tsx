import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { useAppTheme } from '../../src/store/ThemeContext';

export default function TabLayout() {
  const { colors } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: Platform.select({ ios: 84, default: 68 }),
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '本棚',
          tabBarLabel: '本棚',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons color={color} name={focused ? 'library' : 'library-outline'} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'スキャン',
          tabBarLabel: '登録',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons color={color} name={focused ? 'barcode' : 'barcode-outline'} size={27} />
          ),
          tabBarItemStyle: {
            marginTop: -10,
            borderRadius: 24,
          },
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '設定',
          tabBarLabel: '設定',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons color={color} name={focused ? 'settings' : 'settings-outline'} size={24} />
          ),
        }}
      />
    </Tabs>
  );
}
