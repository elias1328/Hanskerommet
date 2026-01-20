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
      Alert.alert('Mangler informasjon', 'Vennligst skriv inn e-post og passord.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (error) {
      Alert.alert('Innlogging feilet', error.message);
    }
  };

  return (
    <AuthShell title="Velkommen tilbake" subtitle="Logg inn for å fortsette">
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

      <Text style={styles.label}>Passord</Text>
      <TextInput
        style={styles.input}
        secureTextEntry
        placeholder="Passord"
        value={password}
        onChangeText={setPassword}
      />

      <Pressable style={styles.primaryButton} onPress={handleSignIn} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Logg inn</Text>}
      </Pressable>

      <Link href="/(auth)/forgot-password" style={styles.link}>
        Glemt passord?
      </Link>

      <View style={{ marginTop: 14, alignItems: 'center' }}>
        <Text style={styles.helper}>Har du ikke konto?</Text>
        <Link href="/(auth)/sign-up" style={styles.link}>
          Opprett konto
        </Link>
      </View>
    </AuthShell>
  );
}
