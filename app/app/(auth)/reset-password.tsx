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
      Alert.alert('Missing password', 'Please enter a new password.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Password mismatch', 'Please confirm your password.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      Alert.alert('Update failed', error.message);
      return;
    }

    Alert.alert('Password updated', 'You are now signed in.');
    router.replace('/(tabs)');
  };

  return (
    <AuthShell title="Set a new password" subtitle="Choose something you will remember">
      <Text style={styles.label}>New password</Text>
      <TextInput
        style={styles.input}
        secureTextEntry
        placeholder="New password"
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

      <Pressable style={styles.primaryButton} onPress={handleUpdate} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Update password</Text>}
      </Pressable>
    </AuthShell>
  );
}
