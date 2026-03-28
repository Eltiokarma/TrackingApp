const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Almacenamiento en memoria
// ---------------------------------------------------------------------------
const units = new Map();

// Mapea socket.id -> unitId para manejar desconexiones
const socketToUnit = new Map();

// Contador para IDs visibles
let visibleIdCounter = 1;

// ---------------------------------------------------------------------------
// Función Haversine — distancia en metros entre dos coordenadas
// ---------------------------------------------------------------------------
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // radio de la Tierra en metros
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ---------------------------------------------------------------------------
// Lógica de alerta de proximidad
// ---------------------------------------------------------------------------
const PROXIMITY_THRESHOLD = 500; // metros

function checkProximity(updatedUnit) {
  for (const [id, other] of units) {
    if (id === updatedUnit.id) continue;
    if (!other.active) continue;
    if (other.lineNumber !== updatedUnit.lineNumber) continue;
    if (other.latitude == null || other.longitude == null) continue;

    const distance = haversineDistance(
      updatedUnit.latitude,
      updatedUnit.longitude,
      other.latitude,
      other.longitude
    );

    if (distance <= PROXIMITY_THRESHOLD) {
      const alertData = {
        distance: Math.round(distance),
        units: [
          { id: updatedUnit.id, name: updatedUnit.name, unitNumber: updatedUnit.unitNumber },
          { id: other.id, name: other.name, unitNumber: other.unitNumber }
        ],
        lineNumber: updatedUnit.lineNumber
      };

      console.log(
        `⚠ Alerta de proximidad: unidades "${updatedUnit.name}" y "${other.name}" a ${Math.round(distance)}m en línea ${updatedUnit.lineNumber}`
      );

      // Emitir a ambos sockets
      if (updatedUnit.socketId) {
        io.to(updatedUnit.socketId).emit('proximity-alert', alertData);
      }
      if (other.socketId) {
        io.to(other.socketId).emit('proximity-alert', alertData);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Endpoints REST
// ---------------------------------------------------------------------------

// Registrar una unidad
app.post('/api/units/register', (req, res) => {
  const { name, lineNumber, unitNumber } = req.body;

  if (!name || lineNumber == null || unitNumber == null) {
    return res.status(400).json({ error: 'Campos requeridos: name, lineNumber, unitNumber' });
  }

  const id = uuidv4();
  const unit = {
    id,
    visibleId: visibleIdCounter++,
    name,
    lineNumber,
    unitNumber,
    latitude: null,
    longitude: null,
    speed: 0,
    heading: 0,
    lastUpdate: null,
    active: true,
    socketId: null
  };

  units.set(id, unit);
  console.log(`✔ Unidad registrada: "${name}" (línea ${lineNumber}, número ${unitNumber}) — ID: ${id}`);

  res.status(201).json({ unitId: id, unit });
});

// Listar todas las unidades activas
app.get('/api/units', (_req, res) => {
  const active = [];
  for (const unit of units.values()) {
    if (unit.active) active.push(unit);
  }
  res.json(active);
});

// Obtener una unidad por ID
app.get('/api/units/:id', (req, res) => {
  const unit = units.get(req.params.id);
  if (!unit) {
    return res.status(404).json({ error: 'Unidad no encontrada' });
  }
  res.json(unit);
});

// ---------------------------------------------------------------------------
// Socket.io — comunicación en tiempo real
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  console.log(`🔌 Nueva conexión Socket.io: ${socket.id}`);

  // Permite asociar un socket a una unidad registrada
  socket.on('register-socket', ({ unitId }) => {
    const unit = units.get(unitId);
    if (unit) {
      unit.socketId = socket.id;
      socketToUnit.set(socket.id, unitId);
      console.log(`🔗 Socket ${socket.id} asociado a unidad "${unit.name}" (${unitId})`);
    }
  });

  // Actualización de ubicación
  socket.on('location-update', (data) => {
    const { unitId, latitude, longitude, speed, heading } = data;

    const unit = units.get(unitId);
    if (!unit) {
      socket.emit('error', { message: 'Unidad no encontrada' });
      return;
    }

    unit.latitude = latitude;
    unit.longitude = longitude;
    unit.speed = speed ?? 0;
    unit.heading = heading ?? 0;
    unit.lastUpdate = new Date().toISOString();
    unit.active = true;

    // Vincular socket si aún no está vinculado
    if (!unit.socketId) {
      unit.socketId = socket.id;
      socketToUnit.set(socket.id, unitId);
    }

    // Broadcast a todos los clientes conectados
    io.emit('location-update', {
      unitId: unit.id,
      visibleId: unit.visibleId,
      name: unit.name,
      lineNumber: unit.lineNumber,
      unitNumber: unit.unitNumber,
      latitude: unit.latitude,
      longitude: unit.longitude,
      speed: unit.speed,
      heading: unit.heading,
      lastUpdate: unit.lastUpdate
    });

    // Verificar proximidad con otras unidades de la misma línea
    checkProximity(unit);
  });

  // Desconexión
  socket.on('disconnect', () => {
    const unitId = socketToUnit.get(socket.id);
    if (unitId) {
      const unit = units.get(unitId);
      if (unit) {
        unit.active = false;
        unit.socketId = null;
        console.log(`❌ Unidad "${unit.name}" (${unitId}) desconectada`);
      }
      socketToUnit.delete(socket.id);
    }
    console.log(`🔌 Socket desconectado: ${socket.id}`);
  });
});

// ---------------------------------------------------------------------------
// Iniciar servidor
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Servidor de rastreo iniciado en puerto ${PORT}`);
  console.log(`📡 Esperando conexiones...`);
});
