import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { SeriesGroup } from './seriesSelectors';
import { normalizeSeriesKey } from './series';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type NewReleaseSubscriptionInput = {
  latestVolume?: number;
  seriesKey: string;
  seriesTitle: string;
};

export type NewReleaseSubscription = NewReleaseSubscriptionInput & {
  enabled: boolean;
};

function getProjectId() {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

export async function registerForNewReleasePushToken() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('new-releases', {
      name: '新刊通知',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    throw new Error('通知が許可されていません。端末の設定で通知を許可してください。');
  }

  const projectId = getProjectId();
  if (!projectId) {
    throw new Error('EAS projectId が見つからないため、通知トークンを取得できません。');
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}

export function buildSeriesSubscriptions(seriesGroups: SeriesGroup[]): NewReleaseSubscriptionInput[] {
  return seriesGroups.map((group) => ({
    latestVolume: group.latestVolume,
    seriesKey: normalizeSeriesKey(group.title),
    seriesTitle: group.title,
  }));
}

export async function enableNewReleaseNotifications(
  userId: string,
  seriesGroups: SeriesGroup[],
) {
  if (!supabase) throw new Error('Supabaseが設定されていません。');

  const expoPushToken = await registerForNewReleasePushToken();
  const now = new Date().toISOString();

  const { error: tokenError } = await supabase.from('push_tokens').upsert(
    {
      enabled: true,
      expo_push_token: expoPushToken,
      last_seen_at: now,
      platform: Platform.OS,
      user_id: userId,
    },
    { onConflict: 'expo_push_token' },
  );
  if (tokenError) throw new Error('通知トークンを保存できませんでした。');

  const subscriptions = buildSeriesSubscriptions(seriesGroups);
  if (subscriptions.length > 0) {
    const { error: subscriptionError } = await supabase
      .from('series_subscriptions')
      .upsert(
        subscriptions.map((subscription) => ({
          enabled: true,
          latest_known_volume: subscription.latestVolume ?? null,
          series_key: subscription.seriesKey,
          series_title: subscription.seriesTitle,
          updated_at: now,
          user_id: userId,
        })),
        { onConflict: 'user_id,series_key' },
      );
    if (subscriptionError) throw new Error('新刊通知のシリーズ登録に失敗しました。');
  }

  return { expoPushToken, subscriptionCount: subscriptions.length };
}

export async function getNewReleaseSubscriptions(userId: string) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('series_subscriptions')
    .select('series_key,series_title,latest_known_volume,enabled')
    .eq('user_id', userId);
  if (error) throw new Error('新刊通知の購読状態を取得できませんでした。');

  return (data ?? []).map((row) => ({
    enabled: Boolean(row.enabled),
    latestVolume:
      typeof row.latest_known_volume === 'number' ? row.latest_known_volume : undefined,
    seriesKey: String(row.series_key),
    seriesTitle: String(row.series_title),
  })) satisfies NewReleaseSubscription[];
}

export async function syncNewReleaseSubscriptions(userId: string, seriesGroups: SeriesGroup[]) {
  if (!supabase) return;
  const subscriptions = buildSeriesSubscriptions(seriesGroups);
  if (subscriptions.length === 0) return;

  const { error } = await supabase.from('series_subscriptions').upsert(
    subscriptions.map((subscription) => ({
      latest_known_volume: subscription.latestVolume ?? null,
      series_key: subscription.seriesKey,
      series_title: subscription.seriesTitle,
      updated_at: new Date().toISOString(),
      user_id: userId,
    })),
    { onConflict: 'user_id,series_key', ignoreDuplicates: true },
  );
  if (error) throw new Error('通知対象シリーズを同期できませんでした。');
}

export async function setNewReleaseSeriesSubscription(
  userId: string,
  subscription: NewReleaseSubscriptionInput,
  enabled: boolean,
) {
  if (!supabase) throw new Error('Supabaseが設定されていません。');

  const { error } = await supabase.from('series_subscriptions').upsert(
    {
      enabled,
      latest_known_volume: subscription.latestVolume ?? null,
      series_key: subscription.seriesKey,
      series_title: subscription.seriesTitle,
      updated_at: new Date().toISOString(),
      user_id: userId,
    },
    { onConflict: 'user_id,series_key' },
  );
  if (error) throw new Error('シリーズの通知設定を保存できませんでした。');
}

export async function disableNewReleaseNotifications(userId: string) {
  if (!supabase) return;

  const { error: tokenError } = await supabase
    .from('push_tokens')
    .update({ enabled: false, last_seen_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (tokenError) throw new Error('通知トークンを無効化できませんでした。');

  const { error: subscriptionError } = await supabase
    .from('series_subscriptions')
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (subscriptionError) throw new Error('新刊通知の購読を無効化できませんでした。');
}
