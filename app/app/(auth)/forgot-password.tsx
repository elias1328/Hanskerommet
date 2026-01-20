import React from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput } from 'react-native';
import { Link } from 'expo-router';
import * as Linking from 'expo-linking';

import { supabase } from '@/lib/supabase';
import { AuthShell, useAuthStyles } from '@/components/auth/auth-shell';

export default function ForgotPasswordScreen() {
  const { styles } = useAuthStyles();
  const [email, setEmail] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleReset = async () => {
    if (!email) {
      Alert.alert('Mangler e-post', 'Vennligst skriv inn e-post.');
      return;
    }

    setLoading(true);
    const redirectUrl = Linking.createURL('auth-callback');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: redirectUrl,
    });
    setLoading(false);

    if (error) {
      Alert.alert('Tilbakestilling feilet', error.message);
    } else {
      Alert.alert('Sjekk e-posten din', 'Vi har sendt deg en tilbakestillingslenke.');
    }
  };

  return (
    <AuthShell title="Tilbakestill passord" subtitle="Vi sender deg en lenke på e-post">
      <Text style={styles.label}>E-post</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="you@email.com"
        value={email}
        onChangeText={setEmail}
      />

      <Pressable style={styles.primaryButton} onPress={handleReset} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Send lenke</Text>}
      </Pressable>

      <Link href="/(auth)/sign-in" style={styles.link}>
        Tilbake til innlogging
      </Link>
    </AuthShell>
  );
}
