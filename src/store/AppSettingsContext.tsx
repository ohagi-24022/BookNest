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
  openExternalPurchaseLinks: boolean;
  showPublishedLatestVolume: boolean;
};

type AppSettingsContextValue = AppSettings & {
  isFavoriteSeries: (seriesTitle: string) => boolean;
  setOpenExternalPurchaseLinks: (value: boolean) => void;
  setShowPublishedLatestVolume: (value: boolean) => void;
  toggleFavoriteSeries: (seriesTitle: string) => void;
};

const defaultSettings: AppSettings = {
  favoriteSeriesKeys: [],
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
