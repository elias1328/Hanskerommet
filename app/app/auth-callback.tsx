import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';

type OtpType = 'signup' | 'magiclink' | 'recovery' | 'email_change' | 'invite';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const run = async () => {
      const code = typeof params.code === 'string' ? params.code : null;
      const tokenHash = typeof params.token_hash === 'string' ? params.token_hash : null;
      const type = typeof params.type === 'string' ? (params.type as OtpType) : null;

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setErrorMessage(error.message);
          return;
        }
        router.replace('/(tabs)');
        return;
      }

      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          type,
          token_hash: tokenHash,
        });
        if (error) {
          setErrorMessage(error.message);
          return;
        }
        if (type === 'recovery') {
          router.replace('/(auth)/reset-password');
        } else {
          router.replace('/(tabs)');
        }
        return;
      }

      setErrorMessage('Mangler bekreftelsesdata.');
    };

    run();
  }, [params, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#0A84FF" />
      <Text style={styles.text}>{errorMessage ?? 'Fullfører innlogging...'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0B0D10',
  },
  text: {
    marginTop: 12,
    color: '#F2F2F7',
    textAlign: 'center',
  },
});
