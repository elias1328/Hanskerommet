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
import { Fonts } from '@/constants/theme';

const LIGHT_THEME = {
  background: '#F1F5F9',
  surface: '#E2E8F0',
  border: '#CBD5E1',
  title: '#0F172A',
  subtitle: '#475569',
  text: '#0F172A',
  textDim: '#64748B',
  inputBg: '#E2E8F0',
  inputBorder: '#CBD5E1',
  primary: '#EA580C',
  primaryText: '#0F172A',
};

const DARK_THEME = {
  background: '#0F172A',
  surface: '#1E293B',
  border: '#334155',
  title: '#F8FAFC',
  subtitle: '#94A3B8',
  text: '#F8FAFC',
  textDim: '#94A3B8',
  inputBg: '#1E293B',
  inputBorder: '#334155',
  primary: '#F97316',
  primaryText: '#0F172A',
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
    <View style={styles.background}>
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
              <Text style={styles.brand}>HANSKEROMMET</Text>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <View style={styles.card}>{children}</View>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const createStyles = (theme: typeof LIGHT_THEME) =>
  StyleSheet.create({
    background: {
      flex: 1,
      backgroundColor: theme.background,
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
      alignItems: 'center',
      marginBottom: 18,
    },
    brand: {
      fontFamily: Fonts.mono,
      fontSize: 20,
      color: theme.primary,
      marginBottom: 10,
      letterSpacing: 2,
    },
    title: {
      fontFamily: Fonts.sans,
      fontSize: 24,
      fontWeight: '800',
      color: theme.title,
      textTransform: 'uppercase',
    },
    subtitle: {
      marginTop: 6,
      fontSize: 14,
      color: theme.subtitle,
      textAlign: 'center',
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 8,
      padding: 18,
      borderWidth: 1,
      borderColor: theme.border,
    },
    footer: {
      marginTop: 18,
      alignItems: 'center',
    },
    label: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.textDim,
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      minHeight: 48,
      fontSize: 16,
      color: theme.text,
      marginBottom: 12,
      backgroundColor: theme.inputBg,
      fontFamily: Fonts.mono,
    },
    primaryButton: {
      backgroundColor: theme.primary,
      borderRadius: 8,
      paddingVertical: 14,
      minHeight: 48,
      alignItems: 'center',
      marginTop: 4,
    },
    primaryText: {
      fontWeight: '800',
      color: theme.primaryText,
      fontSize: 16,
      letterSpacing: 1,
    },
    link: {
      marginTop: 10,
      color: theme.text,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    helper: {
      marginTop: 8,
      color: theme.textDim,
      fontSize: 14,
    },
    orb: {},
    orbOne: {},
    orbTwo: {},
  });
