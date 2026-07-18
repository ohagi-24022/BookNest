import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppSettingsProvider } from '../src/store/AppSettingsContext';
import { AuthProvider } from '../src/store/AuthContext';
import { LibraryProvider } from '../src/store/LibraryContext';
import { ThemeProvider, useAppTheme } from '../src/store/ThemeContext';
import { WishlistProvider } from '../src/store/WishlistContext';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <AppSettingsProvider>
            <WishlistProvider>
              <LibraryProvider>
                <RootStack />
              </LibraryProvider>
            </WishlistProvider>
          </AppSettingsProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function RootStack() {
  const { colors, resolvedMode } = useAppTheme();

  useEffect(() => {
    const lastResponse = Notifications.getLastNotificationResponse();
    const initialUrl = lastResponse?.notification.request.content.data?.url;
    if (typeof initialUrl === 'string') {
      router.push(initialUrl);
    }

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === 'string') {
        router.push(url);
      }
    });

    return () => subscription.remove();
  }, []);

  return (
    <>
      <StatusBar style={resolvedMode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerBackTitle: '戻る',
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
        <Stack.Screen name="help" options={{ title: 'ヘルプ' }} />
        <Stack.Screen name="account" options={{ title: 'ユーザー' }} />
        <Stack.Screen name="notifications" options={{ title: '新刊通知' }} />
        <Stack.Screen name="ranking/[category]" options={{ title: 'ランキング' }} />
        <Stack.Screen name="privacy" options={{ title: 'プライバシーポリシー' }} />
      </Stack>
    </>
  );
}
