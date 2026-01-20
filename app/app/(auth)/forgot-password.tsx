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
      Alert.alert('Missing email', 'Please enter your email.');
      return;
    }

    setLoading(true);
    const redirectUrl = Linking.createURL('auth-callback');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: redirectUrl,
    });
    setLoading(false);

    if (error) {
      Alert.alert('Reset failed', error.message);
    } else {
      Alert.alert('Check your email', 'We sent you a reset link.');
    }
  };

  return (
    <AuthShell title="Reset password" subtitle="We will email you a reset link">
      <Text style={styles.label}>Email</Text>
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
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Send reset link</Text>}
      </Pressable>

      <Link href="/(auth)/sign-in" style={styles.link}>
        Back to sign in
      </Link>
    </AuthShell>
  );
}
