# TrackingApp - Rastreo de Transporte en Tiempo Real

App para rastrear unidades de transporte público en tiempo real. Los conductores ven la posición de las otras unidades de su línea en el mapa y reciben alertas de proximidad.

## Estructura

```
TrackingApp/
├── backend/          # Servidor Node.js + Socket.io
│   └── server.js     # API REST + WebSocket
├── mobile/           # App React Native (Expo)
│   ├── App.js        # Navegación principal
│   └── src/
│       ├── screens/
│       │   ├── LoginScreen.js   # Pantalla de ingreso
│       │   └── MapScreen.js     # Mapa en tiempo real
│       ├── services/
│       │   └── socket.js        # Cliente WebSocket
│       └── constants/
│           └── colors.js        # Colores de la app
```

## Levantar el Backend

```bash
cd backend
npm install
node server.js
```

El servidor corre en `http://localhost:3000`.

## Levantar la App Móvil

```bash
cd mobile
npm install
npx expo start
```

Escanear el QR con Expo Go en Android, o presionar `a` para abrir en emulador Android.

**Nota:** Para Google Maps en Android, agregar tu API key en `app.json` > `android.config.googleMaps.apiKey`.

## Funcionalidades

- **Login rápido**: nombre + número de unidad + línea
- **Mapa en tiempo real**: GPS cada 3 segundos
- **Marcadores por línea**: Roja, Azul, Verde con colores distintos
- **Alerta de proximidad**: vibración + banner cuando otra unidad de tu línea está a menos de 500m
- **Tarjeta inferior**: muestra la unidad más cercana de tu línea y la distancia
