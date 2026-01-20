import React from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { AuthShell, useAuthStyles } from '@/components/auth/auth-shell';

export default function SignInScreen() {
  const { styles } = useAuthStyles();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert('Missing info', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (error) {
      Alert.alert('Sign in failed', error.message);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to continue">
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
        placeholder="Your password"
        value={password}
        onChangeText={setPassword}
      />

      <Pressable style={styles.primaryButton} onPress={handleSignIn} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Sign in</Text>}
      </Pressable>

      <Link href="/(auth)/forgot-password" style={styles.link}>
        Forgot password?
      </Link>

      <View style={{ marginTop: 14, alignItems: 'center' }}>
        <Text style={styles.helper}>No account yet?</Text>
        <Link href="/(auth)/sign-up" style={styles.link}>
          Create one
        </Link>
      </View>
    </AuthShell>
  );
}
