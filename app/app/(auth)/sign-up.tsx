import React from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import * as Linking from 'expo-linking';

import { supabase } from '@/lib/supabase';
import { AuthShell, useAuthStyles } from '@/components/auth/auth-shell';

export default function SignUpScreen() {
  const { styles } = useAuthStyles();
  const [email, setEmail] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleSignUp = async () => {
    if (!email || !username || !password) {
      Alert.alert('Mangler informasjon', 'Vennligst skriv inn e-post, brukernavn og passord.');
      return;
    }
    const cleanUsername = username.trim();
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(cleanUsername)) {
      Alert.alert('Ugyldig brukernavn', 'Bruk 3–24 tegn (bokstaver, tall eller underscore).');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Passordene stemmer ikke', 'Vennligst bekreft passordet.');
      return;
    }

    setLoading(true);
    const redirectUrl = Linking.createURL('auth-callback');
    const availability = await supabase.rpc('is_username_available', { p_username: cleanUsername });
    if (availability.error || availability.data === false) {
      setLoading(false);
      Alert.alert('Brukernavn opptatt', 'Velg et annet brukernavn.');
      return;
    }
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          username: cleanUsername,
        },
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

      <Text style={styles.label}>Brukernavn</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        autoComplete="username"
        placeholder="dittbrukernavn"
        value={username}
        onChangeText={setUsername}
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
