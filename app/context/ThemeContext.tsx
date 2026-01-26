import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEME_PRESETS, ThemePreset } from '@/constants/theme';

const STORAGE_KEY = 'hanskerommet.themePreset';

type AppTheme = {
  scheme: 'light' | 'dark';
  bg: string;
  card: string;
  cardBorder: string;
  primary: string;
  accent: string;
  onAccent: string;
  text: string;
  textDim: string;
  surface: string;
  success: string;
  warning: string;
  danger: string;
  tabBarBg: string;
  tabBarBorder: string;
  blurTint: 'light' | 'dark';
};

const hexToRgb = (hex: string) => {
  const raw = hex.replace('#', '');
  const normalized = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const int = parseInt(normalized, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
};

const hexToRgba = (hex: string, alpha: number) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
};

const adjustColor = (hex: string, amount: number) => {
  const { r, g, b } = hexToRgb(hex);
  const clamp = (value: number) => Math.max(0, Math.min(255, value));
  const next = {
    r: clamp(r + amount),
    g: clamp(g + amount),
    b: clamp(b + amount),
  };
  return `rgb(${next.r},${next.g},${next.b})`;
};

const getContrastText = (hex: string) => {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? '#0F172A' : '#F8FAFC';
};

const buildTheme = (preset: ThemePreset): AppTheme => {
  const scheme = preset.scheme ?? 'dark';
  const text = preset.text ?? (scheme === 'light' ? '#0F172A' : '#F8FAFC');
  const textDim = preset.textDim ?? (scheme === 'light' ? '#475569' : '#94A3B8');
  const bg = preset.primary;
  const card = preset.secondary;
  const cardBorder =
    preset.border ??
    (scheme === 'light' ? adjustColor(preset.secondary, -18) : adjustColor(preset.secondary, 18));
  const surface = preset.secondary;
  const tabBarBg = hexToRgba(preset.primary, scheme === 'light' ? 0.92 : 0.95);
  const tabBarBorder = cardBorder;
  const onAccent = getContrastText(preset.accent);
  return {
    scheme,
    bg,
    card,
    cardBorder,
    primary: preset.accent,
    accent: preset.accent,
    onAccent,
    text,
    textDim,
    surface,
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444',
    tabBarBg,
    tabBarBorder,
    blurTint: scheme === 'light' ? 'light' : 'dark',
  };
};

type ThemeContextValue = {
  themeKey: string;
  setThemeKey: (key: string) => void;
  theme: AppTheme;
  presets: ThemePreset[];
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [themeKey, setThemeKeyState] = useState<string>('verkstedgulv');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored && mounted) {
        setThemeKeyState(stored);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const setThemeKey = useCallback((key: string) => {
    setThemeKeyState(key);
    AsyncStorage.setItem(STORAGE_KEY, key);
  }, []);

  const preset = useMemo(
    () => THEME_PRESETS.find((p) => p.key === themeKey) ?? THEME_PRESETS[0],
    [themeKey]
  );
  const theme = useMemo(() => buildTheme(preset), [preset]);

  const value = useMemo(
    () => ({ themeKey, setThemeKey, theme, presets: THEME_PRESETS }),
    [themeKey, setThemeKey, theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useAppTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useAppTheme must be used within ThemeProvider');
  }
  return ctx;
};
