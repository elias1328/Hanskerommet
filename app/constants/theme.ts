/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const INDUSTRIAL_DARK = {
  bg: '#0F172A',
  surface: '#1E293B',
  accent: '#F97316',
  text: '#F8FAFC',
  textDim: '#94A3B8',
  border: '#334155',
};

const INDUSTRIAL_LIGHT = {
  bg: '#F1F5F9',
  surface: '#E2E8F0',
  accent: '#EA580C',
  text: '#0F172A',
  textDim: '#475569',
  border: '#CBD5E1',
};

export const Colors = {
  light: {
    text: INDUSTRIAL_LIGHT.text,
    background: INDUSTRIAL_LIGHT.bg,
    tint: INDUSTRIAL_LIGHT.accent,
    icon: INDUSTRIAL_LIGHT.textDim,
    tabIconDefault: INDUSTRIAL_LIGHT.textDim,
    tabIconSelected: INDUSTRIAL_LIGHT.accent,
  },
  dark: {
    text: INDUSTRIAL_DARK.text,
    background: INDUSTRIAL_DARK.bg,
    tint: INDUSTRIAL_DARK.accent,
    icon: INDUSTRIAL_DARK.textDim,
    tabIconDefault: INDUSTRIAL_DARK.textDim,
    tabIconSelected: INDUSTRIAL_DARK.accent,
  },
};

export type ThemePreset = {
  key: string;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  border?: string;
  text?: string;
  textDim?: string;
  scheme?: 'light' | 'dark';
};

export const THEME_PRESETS: ThemePreset[] = [
  { key: 'verkstedgulv', name: 'Verkstedgulv', primary: '#0F172A', secondary: '#1E293B', accent: '#F97316', scheme: 'dark' },
  { key: 'felleskjopet', name: 'Felleskjøpet', primary: '#023918', secondary: '#0F4F26', accent: '#FCD116', scheme: 'dark' },
  { key: 'politi', name: 'Politi', primary: '#0B1020', secondary: '#111827', accent: '#3B82F6', text: '#F8FAFC', textDim: '#93C5FD', scheme: 'dark' },
  { key: 'solberg', name: 'Solberg-blå', primary: '#001C38', secondary: '#003366', accent: '#CBA135', scheme: 'dark' },
  { key: 'il-tempo', name: 'Il Tempo Gigante', primary: '#1A1510', secondary: '#2E241B', accent: '#B8860B', text: '#F7E9D2', textDim: '#C9B79F', scheme: 'dark' },
  { key: 'olje', name: 'Olje', primary: '#080504', secondary: '#1C1612', accent: '#D4AF37', scheme: 'dark' },
  { key: 'asfalt', name: 'Asfalt', primary: '#18181B', secondary: '#27272A', accent: '#E4E4E7', scheme: 'dark' },
  { key: 'gti', name: 'GTI', primary: '#111111', secondary: '#1F1F1F', accent: '#DC2626', scheme: 'dark' },
  { key: 'feltvogn', name: 'Feltvogn', primary: '#1C2119', secondary: '#2F382A', accent: '#84CC16', scheme: 'dark' },
  { key: 'kobber', name: 'Kobber', primary: '#101010', secondary: '#1A1A1A', accent: '#B87333', scheme: 'dark' },
  { key: 'oktan98', name: '98 Oktan', primary: '#022c22', secondary: '#115e59', accent: '#2dd4bf', scheme: 'dark' },
  { key: 'kaldstart', name: 'Kaldstart', primary: '#0f172a', secondary: '#334155', accent: '#38bdf8', scheme: 'dark' },
  { key: 'skinnseter', name: 'Skinnseter', primary: '#271c19', secondary: '#45332e', accent: '#d6cbb6', scheme: 'dark' },
  { key: 'solvpilen', name: 'Sølvpilen', primary: '#E5E7EB', secondary: '#F3F4F6', accent: '#000000', text: '#0F172A', textDim: '#334155', border: '#CBD5E1', scheme: 'light' },
  { key: 'sortmatt', name: 'Sort Matt', primary: '#000000', secondary: '#0F0F0F', accent: '#555555', scheme: 'dark' },
];

export const Fonts = Platform.select({
  ios: {
    sans: 'System',
    serif: 'Georgia',
    rounded: 'System',
    mono: 'Menlo',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
