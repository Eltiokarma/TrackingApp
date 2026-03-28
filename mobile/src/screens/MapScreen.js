import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Vibration,
  Animated,
  Dimensions,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import COLORS, { LINE_COLORS } from '../constants/colors';
import { sendLocation, onLocationUpdate, onProximityAlert, getSocket } from '../services/socket';

const { width } = Dimensions.get('window');

const LOCATION_INTERVAL = 3000;

export default function MapScreen({ route }) {
  const { unitData, serverUrl } = route.params;
  const { driverName, unitNumber, line } = unitData;

  const [myLocation, setMyLocation] = useState(null);
  const [otherUnits, setOtherUnits] = useState({});
  const [nearestUnit, setNearestUnit] = useState(null);
  const [proximityAlert, setProximityAlert] = useState(null);
  const [unitId, setUnitId] = useState(null);

  const mapRef = useRef(null);
  const alertOpacity = useRef(new Animated.Value(0)).current;
  const locationWatcher = useRef(null);

  // Register unit via REST API and bind socket
  useEffect(() => {
    async function registerWithServer() {
      try {
        const response = await fetch(`${serverUrl}/api/units/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: driverName,
            lineNumber: line,
            unitNumber: unitNumber,
          }),
        });
        const data = await response.json();
        setUnitId(data.unitId);

        const socket = getSocket();
        if (socket && socket.connected) {
          socket.emit('register-socket', { unitId: data.unitId });
        }
      } catch (err) {
        console.log('Error registrando unidad:', err);
      }
    }

    registerWithServer();
  }, []);

  // Start GPS tracking
  useEffect(() => {
    let watcher = null;

    async function startTracking() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Permiso de ubicacion denegado');
        return;
      }

      watcher = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: LOCATION_INTERVAL,
          distanceInterval: 5,
        },
        (location) => {
          const { latitude, longitude, speed, heading } = location.coords;
          const loc = { latitude, longitude, speed: speed || 0, heading: heading || 0 };
          setMyLocation(loc);

          if (unitId) {
            sendLocation({
              unitId,
              latitude,
              longitude,
              speed: speed || 0,
              heading: heading || 0,
            });
          }
        }
      );
      locationWatcher.current = watcher;
    }

    if (unitId) {
      startTracking();
    }

    return () => {
      if (locationWatcher.current) {
        locationWatcher.current.remove();
      }
    };
  }, [unitId]);

  // Listen for updates from other units
  useEffect(() => {
    const unsubLocation = onLocationUpdate((data) => {
      if (data.unitId === unitId) return;

      setOtherUnits((prev) => ({
        ...prev,
        [data.unitId]: data,
      }));
    });

    const unsubProximity = onProximityAlert((data) => {
      setProximityAlert(data);
      Vibration.vibrate([0, 500, 200, 500]);

      Animated.sequence([
        Animated.timing(alertOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.delay(4000),
        Animated.timing(alertOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start(() => setProximityAlert(null));
    });

    return () => {
      unsubLocation();
      unsubProximity();
    };
  }, [unitId]);

  // Calculate nearest unit on same line
  useEffect(() => {
    if (!myLocation) return;

    let nearest = null;
    let minDist = Infinity;

    Object.values(otherUnits).forEach((unit) => {
      if (unit.lineNumber !== line) return;
      if (unit.latitude == null) return;

      const dist = haversineDistance(
        myLocation.latitude,
        myLocation.longitude,
        unit.latitude,
        unit.longitude
      );

      if (dist < minDist) {
        minDist = dist;
        nearest = { ...unit, distance: Math.round(dist) };
      }
    });

    setNearestUnit(nearest);
  }, [myLocation, otherUnits]);

  const lineColor = LINE_COLORS[line] || COLORS.accent;

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={[styles.topBar, { backgroundColor: lineColor }]}>
        <MaterialCommunityIcons name="bus" size={28} color="#FFF" />
        <Text style={styles.topBarText}>
          Unidad {unitNumber} | {line}
        </Text>
        <View style={styles.statusDot} />
      </View>

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        showsUserLocation={false}
        showsMyLocationButton={false}
        initialRegion={
          myLocation
            ? {
                latitude: myLocation.latitude,
                longitude: myLocation.longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }
            : {
                latitude: -34.6037,
                longitude: -58.3816,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }
        }
        region={
          myLocation
            ? {
                latitude: myLocation.latitude,
                longitude: myLocation.longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }
            : undefined
        }
      >
        {/* My position */}
        {myLocation && (
          <Marker
            coordinate={{
              latitude: myLocation.latitude,
              longitude: myLocation.longitude,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.myMarkerContainer}>
              <View style={[styles.myMarkerPulse, { backgroundColor: lineColor }]} />
              <View style={[styles.myMarker, { backgroundColor: lineColor }]}>
                <MaterialCommunityIcons name="bus" size={20} color="#FFF" />
              </View>
            </View>
          </Marker>
        )}

        {/* Other units */}
        {Object.values(otherUnits).map((unit) => {
          if (unit.latitude == null) return null;
          const color = LINE_COLORS[unit.lineNumber] || COLORS.textLight;

          return (
            <Marker
              key={unit.unitId}
              coordinate={{
                latitude: unit.latitude,
                longitude: unit.longitude,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={[styles.otherMarker, { backgroundColor: color }]}>
                <Text style={styles.otherMarkerText}>{unit.unitNumber}</Text>
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Proximity alert banner */}
      {proximityAlert && (
        <Animated.View style={[styles.alertBanner, { opacity: alertOpacity }]}>
          <MaterialCommunityIcons name="alert" size={28} color="#FFF" />
          <Text style={styles.alertText}>
            UNIDAD CERCA - {proximityAlert.distance}m
          </Text>
        </Animated.View>
      )}

      {/* Bottom info card */}
      {nearestUnit ? (
        <View style={styles.bottomCard}>
          <View style={styles.bottomCardRow}>
            <View
              style={[
                styles.bottomCardDot,
                { backgroundColor: LINE_COLORS[nearestUnit.lineNumber] || COLORS.textLight },
              ]}
            />
            <View style={styles.bottomCardInfo}>
              <Text style={styles.bottomCardTitle}>
                Unidad {nearestUnit.unitNumber} — {nearestUnit.name}
              </Text>
              <Text style={styles.bottomCardDistance}>
                {nearestUnit.distance < 1000
                  ? `${nearestUnit.distance}m`
                  : `${(nearestUnit.distance / 1000).toFixed(1)}km`}
              </Text>
            </View>
            <MaterialCommunityIcons
              name="map-marker-distance"
              size={32}
              color={nearestUnit.distance < 500 ? COLORS.alert : COLORS.accent}
            />
          </View>
        </View>
      ) : (
        <View style={styles.bottomCard}>
          <Text style={styles.bottomCardEmpty}>
            Sin otras unidades en tu linea
          </Text>
        </View>
      )}
    </View>
  );
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 14,
    paddingHorizontal: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  topBarText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 12,
    flex: 1,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#76FF03',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  map: {
    flex: 1,
  },
  myMarkerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 60,
  },
  myMarkerPulse: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    opacity: 0.25,
  },
  myMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFF',
    elevation: 4,
  },
  otherMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    elevation: 3,
  },
  otherMarkerText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  alertBanner: {
    position: 'absolute',
    top: 110,
    left: 16,
    right: 16,
    backgroundColor: COLORS.alert,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  alertText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  bottomCard: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 18,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  bottomCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomCardDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 14,
  },
  bottomCardInfo: {
    flex: 1,
  },
  bottomCardTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  bottomCardDistance: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginTop: 2,
  },
  bottomCardEmpty: {
    textAlign: 'center',
    fontSize: 16,
    color: COLORS.textLight,
  },
});
