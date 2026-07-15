import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { normalizeSeriesKey } from '../lib/series';
import { supabase } from '../lib/supabase';
import { isMissingSupabaseRelationError } from '../lib/supabaseErrors';
import { useAuth } from './AuthContext';

const LEGACY_STORAGE_KEY = 'booknest.app-settings.v1';
const DEVICE_STORAGE_KEY = 'booknest.device-settings.v1';
const GUEST_USER_STORAGE_KEY = 'booknest.user-settings.guest.v1';

type UserSettings = {
  favoriteSeriesKeys: string[];
  newReleaseNotifications: boolean;
};

type DeviceSettings = {
  openExternalPurchaseLinks: boolean;
  showPublishedLatestVolume: boolean;
};

type AppSettings = UserSettings & DeviceSettings;

type AppSettingsContextValue = AppSettings & {
  hydrated: boolean;
  isFavoriteSeries: (seriesTitle: string) => boolean;
  migrateFavoriteSeries: (fromSeriesTitle: string, toSeriesTitle: string) => void;
  setFavoriteSeries: (seriesTitle: string, favorite: boolean) => void;
  setNewReleaseNotifications: (value: boolean) => void;
  setOpenExternalPurchaseLinks: (value: boolean) => void;
  setShowPublishedLatestVolume: (value: boolean) => void;
  toggleFavoriteSeries: (seriesTitle: string) => void;
};

const defaultUserSettings: UserSettings = {
  favoriteSeriesKeys: [],
  newReleaseNotifications: false,
};

const defaultDeviceSettings: DeviceSettings = {
  openExternalPurchaseLinks: false,
  showPublishedLatestVolume: false,
};

const defaultSettings: AppSettings = {
  ...defaultUserSettings,
  ...defaultDeviceSettings,
};

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeFavoriteKeys(values: string[]) {
  return uniqueValues(values.map((value) => normalizeSeriesKey(value)));
}

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

export function AppSettingsProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const userStorageKey = user ? `booknest.user-settings.${user.id}.v1` : GUEST_USER_STORAGE_KEY;
  const [userSettings, setUserSettings] = useState<UserSettings>(defaultUserSettings);
  const [deviceSettings, setDeviceSettings] = useState<DeviceSettings>(defaultDeviceSettings);
  const [hydrated, setHydrated] = useState(false);
  const hydratedStorageKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    hydratedStorageKeyRef.current = null;
    setHydrated(false);
    setUserSettings(defaultUserSettings);

    Promise.all([
      AsyncStorage.getItem(userStorageKey),
      AsyncStorage.getItem(DEVICE_STORAGE_KEY),
      AsyncStorage.getItem(LEGACY_STORAGE_KEY),
      AsyncStorage.getItem(GUEST_USER_STORAGE_KEY),
      user && supabase
        ? supabase
            .from('favorite_series')
            .select('series_key, series_title')
            .eq('user_id', user.id)
            .then(({ data, error }) => {
              if (error) {
                if (isMissingSupabaseRelationError(error)) return [];
                console.warn('Failed to load favorite series from Supabase', error);
                return [];
              }
              return (data ?? []).flatMap((row) => {
                const seriesKey = typeof row.series_key === 'string' ? row.series_key : '';
                const seriesTitle = typeof row.series_title === 'string' ? row.series_title : '';
                return [seriesKey, seriesTitle].map((value) => normalizeSeriesKey(value));
              });
            })
        : Promise.resolve([]),
    ])
      .then(([storedUserSettings, storedDeviceSettings, legacySettings, guestUserSettings, remoteFavoriteKeys]) => {
        if (cancelled) return;
        const parsedUserSettings = storedUserSettings
          ? (JSON.parse(storedUserSettings) as Partial<UserSettings>)
          : legacySettings && !user
            ? (JSON.parse(legacySettings) as Partial<UserSettings>)
            : {};
        const parsedGuestUserSettings = guestUserSettings
          ? (JSON.parse(guestUserSettings) as Partial<UserSettings>)
          : {};
        const parsedDeviceSettings = storedDeviceSettings
          ? (JSON.parse(storedDeviceSettings) as Partial<DeviceSettings>)
          : legacySettings
            ? (JSON.parse(legacySettings) as Partial<DeviceSettings>)
            : {};
        const localFavoriteKeys = Array.isArray(parsedUserSettings.favoriteSeriesKeys)
          ? normalizeFavoriteKeys(parsedUserSettings.favoriteSeriesKeys)
          : [];
        const guestFavoriteKeys = user && Array.isArray(parsedGuestUserSettings.favoriteSeriesKeys)
          ? normalizeFavoriteKeys(parsedGuestUserSettings.favoriteSeriesKeys)
          : [];

        setUserSettings({
          ...defaultUserSettings,
          ...parsedUserSettings,
          favoriteSeriesKeys: normalizeFavoriteKeys([...localFavoriteKeys, ...guestFavoriteKeys, ...remoteFavoriteKeys]),
        });
        setDeviceSettings({
          ...defaultDeviceSettings,
          ...parsedDeviceSettings,
        });
      })
      .finally(() => {
        if (cancelled) return;
        hydratedStorageKeyRef.current = userStorageKey;
        setHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [user, userStorageKey]);

  useEffect(() => {
    if (!hydrated || hydratedStorageKeyRef.current !== userStorageKey) return;
    AsyncStorage.setItem(userStorageKey, JSON.stringify(userSettings));
    AsyncStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(deviceSettings));
  }, [deviceSettings, hydrated, userSettings, userStorageKey]);

  const value = useMemo(
    () => ({
      ...userSettings,
      ...deviceSettings,
      hydrated,
      isFavoriteSeries: (seriesTitle: string) =>
        userSettings.favoriteSeriesKeys.includes(normalizeSeriesKey(seriesTitle)),
      migrateFavoriteSeries: (fromSeriesTitle: string, toSeriesTitle: string) => {
        const fromKey = normalizeSeriesKey(fromSeriesTitle);
        const toKey = normalizeSeriesKey(toSeriesTitle);
        if (!fromKey || !toKey || fromKey === toKey) return;
        setUserSettings((current) => {
          if (!current.favoriteSeriesKeys.includes(fromKey)) return current;
          return {
            ...current,
            favoriteSeriesKeys: [
              ...current.favoriteSeriesKeys.filter((key) => key !== fromKey && key !== toKey),
              toKey,
            ],
          };
        });
      },
      setNewReleaseNotifications: (newReleaseNotifications: boolean) =>
        setUserSettings((current) => ({ ...current, newReleaseNotifications })),
      setFavoriteSeries: (seriesTitle: string, favorite: boolean) => {
        const seriesKey = normalizeSeriesKey(seriesTitle);
        if (!seriesKey) return;
        setUserSettings((current) => {
          const currentKeys = current.favoriteSeriesKeys.filter((key) => key !== seriesKey);
          return {
            ...current,
            favoriteSeriesKeys: favorite ? [...currentKeys, seriesKey] : currentKeys,
          };
        });
      },
      setOpenExternalPurchaseLinks: (openExternalPurchaseLinks: boolean) =>
        setDeviceSettings((current) => ({ ...current, openExternalPurchaseLinks })),
      setShowPublishedLatestVolume: (showPublishedLatestVolume: boolean) =>
        setDeviceSettings((current) => ({ ...current, showPublishedLatestVolume })),
      toggleFavoriteSeries: (seriesTitle: string) => {
        const seriesKey = normalizeSeriesKey(seriesTitle);
        setUserSettings((current) => ({
          ...current,
          favoriteSeriesKeys: current.favoriteSeriesKeys.includes(seriesKey)
            ? current.favoriteSeriesKeys.filter((key) => key !== seriesKey)
            : [...current.favoriteSeriesKeys, seriesKey],
        }));
      },
    }),
    [deviceSettings, hydrated, userSettings],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings() {
  const context = useContext(AppSettingsContext);
  if (!context) {
    throw new Error('useAppSettings must be used inside AppSettingsProvider');
  }

  return context;
}
