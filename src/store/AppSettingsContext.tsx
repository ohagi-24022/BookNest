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
  isFavoriteSeries: (seriesTitle: string) => boolean;
  migrateFavoriteSeries: (fromSeriesTitle: string, toSeriesTitle: string) => void;
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
    ])
      .then(([storedUserSettings, storedDeviceSettings, legacySettings]) => {
        if (cancelled) return;
        const parsedUserSettings = storedUserSettings
          ? (JSON.parse(storedUserSettings) as Partial<UserSettings>)
          : legacySettings && !user
            ? (JSON.parse(legacySettings) as Partial<UserSettings>)
            : {};
        const parsedDeviceSettings = storedDeviceSettings
          ? (JSON.parse(storedDeviceSettings) as Partial<DeviceSettings>)
          : legacySettings
            ? (JSON.parse(legacySettings) as Partial<DeviceSettings>)
            : {};

        setUserSettings({
          ...defaultUserSettings,
          ...parsedUserSettings,
          favoriteSeriesKeys: Array.isArray(parsedUserSettings.favoriteSeriesKeys)
            ? parsedUserSettings.favoriteSeriesKeys
            : [],
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
    [deviceSettings, userSettings],
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
