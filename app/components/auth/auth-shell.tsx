import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { Fonts } from '@/constants/theme';

const LIGHT_THEME = {
  background: ['#F2F2F7', '#FFFFFF', '#E9EEF6'],
  card: '#FFFFFF',
  cardBorder: '#E5E5EA',
  title: '#1C1C1E',
  subtitle: '#6B7280',
  text: '#1C1C1E',
  textDim: '#8E8E93',
  inputBg: '#F9FAFB',
  inputBorder: '#D1D5DB',
  primary: '#0A84FF',
  primaryText: '#FFFFFF',
  accent: '#BF5AF2',
  orbOne: 'rgba(191, 90, 242, 0.18)',
  orbTwo: 'rgba(10, 132, 255, 0.18)',
};

const DARK_THEME = {
  background: ['#0B0D10', '#14171C', '#0B0D10'],
  card: '#14171C',
  cardBorder: '#232834',
  title: '#F2F2F7',
  subtitle: '#9CA3AF',
  text: '#E5E7EB',
  textDim: '#9CA3AF',
  inputBg: '#1C1F26',
  inputBorder: '#2F3544',
  primary: '#0A84FF',
  primaryText: '#FFFFFF',
  accent: '#BF5AF2',
  orbOne: 'rgba(191, 90, 242, 0.28)',
  orbTwo: 'rgba(10, 132, 255, 0.22)',
};

export const useAuthStyles = () => {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? DARK_THEME : LIGHT_THEME;
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  return { theme, styles };
};

type AuthShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  const { theme, styles } = useAuthStyles();

  return (
    <LinearGradient colors={theme.background} style={styles.background}>
      <View style={[styles.orb, styles.orbOne, { backgroundColor: theme.orbOne }]} />
      <View style={[styles.orb, styles.orbTwo, { backgroundColor: theme.orbTwo }]} />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <Text style={styles.brand}>Hanskerommet</Text>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <View style={styles.card}>{children}</View>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const createStyles = (theme: typeof LIGHT_THEME) =>
  StyleSheet.create({
    background: {
      flex: 1,
    },
    safeArea: {
      flex: 1,
    },
    flex: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 32,
      paddingBottom: 32,
      justifyContent: 'center',
    },
    header: {
      marginBottom: 18,
    },
    brand: {
      fontFamily: Fonts.rounded,
      fontSize: 16,
      color: theme.accent,
      marginBottom: 8,
    },
    title: {
      fontFamily: Fonts.rounded,
      fontSize: 28,
      fontWeight: '700',
      color: theme.title,
    },
    subtitle: {
      marginTop: 6,
      fontSize: 15,
      color: theme.subtitle,
    },
    card: {
      backgroundColor: theme.card,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: theme.cardBorder,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    footer: {
      marginTop: 18,
      alignItems: 'center',
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textDim,
      marginBottom: 6,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      color: theme.text,
      marginBottom: 12,
      backgroundColor: theme.inputBg,
    },
    primaryButton: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 4,
    },
    primaryText: {
      fontWeight: '700',
      color: theme.primaryText,
      fontSize: 16,
    },
    link: {
      marginTop: 10,
      color: theme.accent,
      fontWeight: '600',
    },
    helper: {
      marginTop: 8,
      color: theme.textDim,
      fontSize: 12,
    },
    orb: {
      position: 'absolute',
      width: 280,
      height: 280,
      borderRadius: 140,
      opacity: 0.9,
    },
    orbOne: {
      top: -80,
      right: -120,
    },
    orbTwo: {
      bottom: -100,
      left: -130,
    },
  });
