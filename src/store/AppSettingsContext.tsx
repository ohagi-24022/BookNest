import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { normalizeSeriesKey } from '../lib/series';

const STORAGE_KEY = 'booknest.app-settings.v1';

type AppSettings = {
  favoriteSeriesKeys: string[];
  newReleaseNotifications: boolean;
  openExternalPurchaseLinks: boolean;
  showPublishedLatestVolume: boolean;
};

type AppSettingsContextValue = AppSettings & {
  isFavoriteSeries: (seriesTitle: string) => boolean;
  migrateFavoriteSeries: (fromSeriesTitle: string, toSeriesTitle: string) => void;
  setNewReleaseNotifications: (value: boolean) => void;
  setOpenExternalPurchaseLinks: (value: boolean) => void;
  setShowPublishedLatestVolume: (value: boolean) => void;
  toggleFavoriteSeries: (seriesTitle: string) => void;
};

const defaultSettings: AppSettings = {
  favoriteSeriesKeys: [],
  newReleaseNotifications: false,
  openExternalPurchaseLinks: false,
  showPublishedLatestVolume: false,
};

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

export function AppSettingsProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((storedSettings) => {
        if (storedSettings) {
          const parsedSettings = JSON.parse(storedSettings) as Partial<AppSettings>;
          setSettings({
            ...defaultSettings,
            ...parsedSettings,
            favoriteSeriesKeys: Array.isArray(parsedSettings.favoriteSeriesKeys)
              ? parsedSettings.favoriteSeriesKeys
              : [],
          });
        }
      })
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [hydrated, settings]);

  const value = useMemo(
    () => ({
      ...settings,
      isFavoriteSeries: (seriesTitle: string) =>
        settings.favoriteSeriesKeys.includes(normalizeSeriesKey(seriesTitle)),
      migrateFavoriteSeries: (fromSeriesTitle: string, toSeriesTitle: string) => {
        const fromKey = normalizeSeriesKey(fromSeriesTitle);
        const toKey = normalizeSeriesKey(toSeriesTitle);
        if (!fromKey || !toKey || fromKey === toKey) return;
        setSettings((current) => {
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
        setSettings((current) => ({ ...current, newReleaseNotifications })),
      setOpenExternalPurchaseLinks: (openExternalPurchaseLinks: boolean) =>
        setSettings((current) => ({ ...current, openExternalPurchaseLinks })),
      setShowPublishedLatestVolume: (showPublishedLatestVolume: boolean) =>
        setSettings((current) => ({ ...current, showPublishedLatestVolume })),
      toggleFavoriteSeries: (seriesTitle: string) => {
        const seriesKey = normalizeSeriesKey(seriesTitle);
        setSettings((current) => ({
          ...current,
          favoriteSeriesKeys: current.favoriteSeriesKeys.includes(seriesKey)
            ? current.favoriteSeriesKeys.filter((key) => key !== seriesKey)
            : [...current.favoriteSeriesKeys, seriesKey],
        }));
      },
    }),
    [settings],
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
