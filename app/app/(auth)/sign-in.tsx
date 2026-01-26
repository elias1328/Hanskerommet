import React from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { AuthShell, useAuthStyles } from '@/components/auth/auth-shell';

export default function SignInScreen() {
  const { styles } = useAuthStyles();
  const [identifier, setIdentifier] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleSignIn = async () => {
    if (!identifier || !password) {
      Alert.alert('Mangler informasjon', 'Vennligst skriv inn e-post/brukernavn og passord.');
      return;
    }

    let email = identifier.trim();
    if (!email.includes('@')) {
      const { data, error } = await supabase.rpc('get_email_for_username', {
        p_username: email,
      });
      if (error || !data) {
        Alert.alert('Innlogging feilet', 'Fant ingen bruker med dette brukernavnet.');
        return;
      }
      email = String(data);
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);

    if (error) {
      Alert.alert('Innlogging feilet', error.message);
    }
  };

  return (
    <AuthShell title="Velkommen tilbake" subtitle="Logg inn for å fortsette">
      <Text style={styles.label}>E-post eller brukernavn</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        autoComplete="username"
        keyboardType="email-address"
        placeholder="epost eller brukernavn"
        value={identifier}
        onChangeText={setIdentifier}
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
