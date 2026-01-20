import React from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import * as Linking from 'expo-linking';

import { supabase } from '@/lib/supabase';
import { AuthShell, useAuthStyles } from '@/components/auth/auth-shell';

export default function SignUpScreen() {
  const { styles } = useAuthStyles();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert('Missing info', 'Please enter your email and password.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Password mismatch', 'Please confirm your password.');
      return;
    }

    setLoading(true);
    const redirectUrl = Linking.createURL('auth-callback');
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });
    setLoading(false);

    if (error) {
      Alert.alert('Sign up failed', error.message);
    }
  };

  return (
    <AuthShell title="Create account" subtitle="Start your first session">
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

      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        secureTextEntry
        placeholder="Create a password"
        value={password}
        onChangeText={setPassword}
      />

      <Text style={styles.label}>Confirm password</Text>
      <TextInput
        style={styles.input}
        secureTextEntry
        placeholder="Re-enter password"
        value={confirm}
        onChangeText={setConfirm}
      />

      <Pressable style={styles.primaryButton} onPress={handleSignUp} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Create account</Text>}
      </Pressable>

      <View style={{ marginTop: 14, alignItems: 'center' }}>
        <Text style={styles.helper}>Already have an account?</Text>
        <Link href="/(auth)/sign-in" style={styles.link}>
          Sign in
        </Link>
      </View>
    </AuthShell>
  );
}
