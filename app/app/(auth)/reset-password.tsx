import React from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { AuthShell, useAuthStyles } from '@/components/auth/auth-shell';

export default function ResetPasswordScreen() {
  const { styles } = useAuthStyles();
  const router = useRouter();
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleUpdate = async () => {
    if (!password) {
      Alert.alert('Mangler passord', 'Vennligst skriv inn et nytt passord.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Passordene stemmer ikke', 'Vennligst bekreft passordet.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      Alert.alert('Oppdatering feilet', error.message);
      return;
    }

    Alert.alert('Passord oppdatert', 'Du er nå logget inn.');
    router.replace('/(tabs)');
  };

  return (
    <AuthShell title="Velg nytt passord" subtitle="Velg noe du husker">
      <Text style={styles.label}>Nytt passord</Text>
      <TextInput
        style={styles.input}
        secureTextEntry
        placeholder="Nytt passord"
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

      <Pressable style={styles.primaryButton} onPress={handleUpdate} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Oppdater passord</Text>}
      </Pressable>
    </AuthShell>
  );
}
