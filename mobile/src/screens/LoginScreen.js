import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  FlatList,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import COLORS from '../constants/colors';
import { connect, registerUnit } from '../services/socket';

const LINES = ['Línea Roja', 'Línea Azul', 'Línea Verde'];

const LINE_ICONS = {
  'Línea Roja': { color: COLORS.lineRoja },
  'Línea Azul': { color: COLORS.lineAzul },
  'Línea Verde': { color: COLORS.lineVerde },
};

export default function LoginScreen({ navigation, route }) {
  const { serverUrl } = route.params || {};
  const [driverName, setDriverName] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [selectedLine, setSelectedLine] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const handleEnter = async () => {
    if (!driverName.trim()) {
      Alert.alert('Campo requerido', 'Ingresa tu nombre de conductor.');
      return;
    }

    const num = parseInt(unitNumber, 10);
    if (!unitNumber.trim() || isNaN(num) || num < 1 || num > 99) {
      Alert.alert('Campo requerido', 'Ingresa un número de unidad válido (1-99).');
      return;
    }

    if (!selectedLine) {
      Alert.alert('Campo requerido', 'Selecciona una línea.');
      return;
    }

    setConnecting(true);

    try {
      const socket = connect(serverUrl);

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('timeout'));
        }, 8000);

        socket.on('connect', () => {
          clearTimeout(timeout);
          resolve();
        });

        socket.on('connect_error', () => {
          clearTimeout(timeout);
          reject(new Error('connection_error'));
        });

        if (socket.connected) {
          clearTimeout(timeout);
          resolve();
        }
      });

      const unitData = {
        driverName: driverName.trim(),
        unitNumber: num,
        line: selectedLine,
      };

      registerUnit(unitData);

      navigation.replace('Map', { unitData, serverUrl });
    } catch (err) {
      Alert.alert(
        'Error de conexión',
        'No se pudo conectar al servidor. Verifica tu conexión.',
        [{ text: 'Reintentar', onPress: () => setConnecting(false) }]
      );
    } finally {
      setConnecting(false);
    }
  };

  const renderLinePicker = () => (
    <Modal
      visible={showPicker}
      transparent
      animationType="fade"
      onRequestClose={() => setShowPicker(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setShowPicker(false)}
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Selecciona tu línea</Text>
          <FlatList
            data={LINES}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.lineOption,
                  selectedLine === item && styles.lineOptionSelected,
                ]}
                onPress={() => {
                  setSelectedLine(item);
                  setShowPicker(false);
                }}
              >
                <View
                  style={[
                    styles.lineColorDot,
                    { backgroundColor: LINE_ICONS[item].color },
                  ]}
                />
                <Text
                  style={[
                    styles.lineOptionText,
                    selectedLine === item && styles.lineOptionTextSelected,
                  ]}
                >
                  {item}
                </Text>
                {selectedLine === item && (
                  <MaterialCommunityIcons
                    name="check-bold"
                    size={24}
                    color={COLORS.primary}
                  />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );

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
          <MaterialCommunityIcons name="bus-marker" size={64} color="#FFF" />
          <Text style={styles.title}>TrackingApp</Text>
          <Text style={styles.subtitle}>Rastreo en tiempo real</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.label}>Nombre del conductor</Text>
          <TextInput
            style={styles.input}
            placeholder="Tu nombre"
            placeholderTextColor={COLORS.textLight}
            value={driverName}
            onChangeText={setDriverName}
            autoCapitalize="words"
            returnKeyType="next"
          />

          <Text style={styles.label}>Número de unidad</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: 42"
            placeholderTextColor={COLORS.textLight}
            value={unitNumber}
            onChangeText={(text) => {
              const cleaned = text.replace(/[^0-9]/g, '');
              if (cleaned === '' || (parseInt(cleaned, 10) <= 99)) {
                setUnitNumber(cleaned);
              }
            }}
            keyboardType="number-pad"
            maxLength={2}
            returnKeyType="done"
          />

          <Text style={styles.label}>Línea</Text>
          <TouchableOpacity
            style={styles.picker}
            onPress={() => setShowPicker(true)}
          >
            {selectedLine ? (
              <View style={styles.selectedLineRow}>
                <View
                  style={[
                    styles.lineColorDotSmall,
                    { backgroundColor: LINE_ICONS[selectedLine].color },
                  ]}
                />
                <Text style={styles.pickerText}>{selectedLine}</Text>
              </View>
            ) : (
              <Text style={styles.pickerPlaceholder}>Selecciona una línea</Text>
            )}
            <MaterialCommunityIcons
              name="chevron-down"
              size={28}
              color={COLORS.textLight}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, connecting && styles.buttonDisabled]}
            onPress={handleEnter}
            disabled={connecting}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name={connecting ? 'loading' : 'login'}
              size={28}
              color="#FFF"
            />
            <Text style={styles.buttonText}>
              {connecting ? 'CONECTANDO...' : 'ENTRAR'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {renderLinePicker()}
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
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 12,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.accentLight,
    marginTop: 4,
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
  picker: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
  },
  pickerText: {
    fontSize: 18,
    color: COLORS.text,
  },
  pickerPlaceholder: {
    fontSize: 18,
    color: COLORS.textLight,
  },
  selectedLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lineColorDotSmall: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 10,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
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
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  lineOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: COLORS.background,
  },
  lineOptionSelected: {
    backgroundColor: '#E8F5E9',
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  lineColorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 14,
  },
  lineOptionText: {
    fontSize: 20,
    color: COLORS.text,
    flex: 1,
    fontWeight: '500',
  },
  lineOptionTextSelected: {
    fontWeight: 'bold',
    color: COLORS.primary,
  },
});
