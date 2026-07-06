import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-gesture-handler';

import { AppSettingsProvider } from '../src/store/AppSettingsContext';
import { AuthProvider } from '../src/store/AuthContext';
import { LibraryProvider } from '../src/store/LibraryContext';
import { ThemeProvider, useAppTheme } from '../src/store/ThemeContext';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppSettingsProvider>
        <AuthProvider>
          <LibraryProvider>
            <RootStack />
          </LibraryProvider>
        </AuthProvider>
      </AppSettingsProvider>
    </ThemeProvider>
  );
}

function RootStack() {
  const { colors, resolvedMode } = useAppTheme();

  return (
    <>
      <StatusBar style={resolvedMode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="series/[title]" options={{ title: 'シリーズ' }} />
        <Stack.Screen name="book/[id]" options={{ title: '巻の情報' }} />
      </Stack>
    </>
  );
}
