import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'booknest.theme.v1';

type ThemeColors = {
  background: string;
  surface: string;
  elevated: string;
  text: string;
  muted: string;
  border: string;
  input: string;
  primary: string;
  danger: string;
  success: string;
};

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedMode: 'light' | 'dark';
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
};

const lightColors: ThemeColors = {
  background: '#ffffff',
  surface: '#ffffff',
  elevated: '#f4f4f4',
  text: '#111111',
  muted: '#666666',
  border: '#e5e5e5',
  input: '#f4f4f4',
  primary: '#0a84ff',
  danger: '#ff3b30',
  success: '#138a3d',
};

const darkColors: ThemeColors = {
  background: '#050505',
  surface: '#111111',
  elevated: '#1d1d1d',
  text: '#f5f5f5',
  muted: '#a3a3a3',
  border: '#2a2a2a',
  input: '#171717',
  primary: '#0a84ff',
  danger: '#ff453a',
  success: '#31c759',
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemMode = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((storedMode) => {
      if (storedMode === 'system' || storedMode === 'light' || storedMode === 'dark') {
        setModeState(storedMode);
      }
    });
  }, []);

  const setMode = (nextMode: ThemeMode) => {
    setModeState(nextMode);
    AsyncStorage.setItem(STORAGE_KEY, nextMode);
  };

  const resolvedMode = mode === 'system' ? (systemMode === 'dark' ? 'dark' : 'light') : mode;
  const colors = resolvedMode === 'dark' ? darkColors : lightColors;

  const value = useMemo(
    () => ({
      mode,
      resolvedMode,
      colors,
      setMode,
    }),
    [colors, mode, resolvedMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used inside ThemeProvider');
  }

  return context;
}
