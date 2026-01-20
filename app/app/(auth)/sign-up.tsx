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
      Alert.alert('Mangler informasjon', 'Vennligst skriv inn e-post og passord.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Passordene stemmer ikke', 'Vennligst bekreft passordet.');
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
      Alert.alert('Registrering feilet', error.message);
    }
  };

  return (
    <AuthShell title="Opprett konto" subtitle="Kom i gang">
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
        placeholder="Opprett et passord"
        value={password}
        onChangeText={setPassword}
      />

      <Text style={styles.label}>Bekreft passord</Text>
      <TextInput
        style={styles.input}
        secureTextEntry
        placeholder="Skriv inn passordet på nytt"
        value={confirm}
        onChangeText={setConfirm}
      />

      <Pressable style={styles.primaryButton} onPress={handleSignUp} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Opprett konto</Text>}
      </Pressable>

      <View style={{ marginTop: 14, alignItems: 'center' }}>
        <Text style={styles.helper}>Har du allerede en konto?</Text>
        <Link href="/(auth)/sign-in" style={styles.link}>
          Logg inn
        </Link>
      </View>
    </AuthShell>
  );
}
