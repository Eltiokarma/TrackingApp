import { io } from 'socket.io-client';

const DEFAULT_URL = 'http://10.0.2.2:3000';

let socket = null;

export function connect(serverUrl) {
  const url = serverUrl || DEFAULT_URL;

  if (socket && socket.connected) {
    socket.disconnect();
  }

  socket = io(url, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Conectado:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Desconectado:', reason);
  });

  socket.on('connect_error', (err) => {
    console.log('[Socket] Error de conexión:', err.message);
  });

  return socket;
}

export function disconnect() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function registerUnit(unitData) {
  if (socket && socket.connected) {
    socket.emit('register-unit', unitData);
  }
}

export function sendLocation(data) {
  if (socket && socket.connected) {
    socket.emit('location-update', data);
  }
}

export function onLocationUpdate(callback) {
  if (socket) {
    socket.on('location-update', callback);
  }
  return () => {
    if (socket) {
      socket.off('location-update', callback);
    }
  };
}

export function onProximityAlert(callback) {
  if (socket) {
    socket.on('proximity-alert', callback);
  }
  return () => {
    if (socket) {
      socket.off('proximity-alert', callback);
    }
  };
}

export function getSocket() {
  return socket;
}

export default {
  connect,
  disconnect,
  registerUnit,
  sendLocation,
  onLocationUpdate,
  onProximityAlert,
  getSocket,
};
