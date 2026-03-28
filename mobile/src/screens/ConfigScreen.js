import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import COLORS from '../constants/colors';

export default function ConfigScreen({ navigation }) {
  const [serverIp, setServerIp] = useState('192.168.1.');
  const [serverPort, setServerPort] = useState('3000');
  const [testing, setTesting] = useState(false);
  const [connectionResult, setConnectionResult] = useState(null); // 'success' | 'error' | null

  const buildServerUrl = () => `http://${serverIp}:${serverPort}`;

  const handleTestConnection = async () => {
    if (!serverIp.trim() || !serverPort.trim()) {
      setConnectionResult('error');
      return;
    }

    setTesting(true);
    setConnectionResult(null);

    try {
      const url = `${buildServerUrl()}/api/units`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        setConnectionResult('success');
      } else {
        setConnectionResult('error');
      }
    } catch (err) {
      setConnectionResult('error');
    } finally {
      setTesting(false);
    }
  };

  const handleContinue = () => {
    navigation.replace('Login', { serverUrl: buildServerUrl() });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <MaterialCommunityIcons name="server-network" size={64} color="#FFF" />
          <Text style={styles.title}>Configuración del Servidor</Text>
          <Text style={styles.subtitle}>
            Ingresa la IP de tu computadora en la red local
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.label}>Dirección IP del servidor</Text>
          <TextInput
            style={styles.input}
            placeholder="192.168.1.100"
            placeholderTextColor={COLORS.textLight}
            value={serverIp}
            onChangeText={(text) => {
              setServerIp(text);
              setConnectionResult(null);
            }}
            keyboardType="decimal-pad"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />

          <Text style={styles.label}>Puerto</Text>
          <TextInput
            style={styles.input}
            placeholder="3000"
            placeholderTextColor={COLORS.textLight}
            value={serverPort}
            onChangeText={(text) => {
              const cleaned = text.replace(/[^0-9]/g, '');
              setServerPort(cleaned);
              setConnectionResult(null);
            }}
            keyboardType="number-pad"
            maxLength={5}
            returnKeyType="done"
          />

          {/* Connection result */}
          {connectionResult === 'success' && (
            <View style={styles.resultRow}>
              <MaterialCommunityIcons
                name="check-circle"
                size={32}
                color={COLORS.accent}
              />
              <Text style={styles.resultSuccess}>Conectado!</Text>
            </View>
          )}

          {connectionResult === 'error' && (
            <View style={styles.resultRow}>
              <MaterialCommunityIcons
                name="close-circle"
                size={32}
                color={COLORS.error}
              />
              <Text style={styles.resultError}>No se pudo conectar</Text>
            </View>
          )}

          {/* Test button */}
          <TouchableOpacity
            style={[styles.button, styles.testButton, testing && styles.buttonDisabled]}
            onPress={handleTestConnection}
            disabled={testing}
            activeOpacity={0.8}
          >
            {testing ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <MaterialCommunityIcons name="wifi-check" size={28} color="#FFF" />
            )}
            <Text style={styles.buttonText}>
              {testing ? 'PROBANDO...' : 'PROBAR CONEXIÓN'}
            </Text>
          </TouchableOpacity>

          {/* Continue button */}
          <TouchableOpacity
            style={[
              styles.button,
              styles.continueButton,
              connectionResult !== 'success' && styles.buttonDisabled,
            ]}
            onPress={handleContinue}
            disabled={connectionResult !== 'success'}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="arrow-right-bold" size={28} color="#FFF" />
            <Text style={styles.buttonText}>CONTINUAR</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 30,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.accentLight,
    marginTop: 8,
    textAlign: 'center',
  },
  form: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
    flex: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    color: COLORS.text,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  resultSuccess: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.accent,
    marginLeft: 10,
  },
  resultError: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.error,
    marginLeft: 10,
  },
  button: {
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  testButton: {
    backgroundColor: COLORS.primaryLight,
    marginTop: 32,
  },
  continueButton: {
    backgroundColor: COLORS.primary,
  },
  buttonDisabled: {
    backgroundColor: COLORS.textLight,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: 'bold',
    marginLeft: 10,
    letterSpacing: 1,
  },
});
