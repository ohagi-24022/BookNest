import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import 'react-native-gesture-handler';

import { LibraryProvider } from '../src/store/LibraryContext';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <LibraryProvider>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colorScheme === 'dark' ? '#050505' : '#ffffff' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="series/[title]" options={{ title: 'Series' }} />
      </Stack>
    </LibraryProvider>
  );
}
