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
// Simulación — unidades ficticias moviéndose en el mapa
// ---------------------------------------------------------------------------
let simulationIntervals = [];
let simulatedUnitIds = [];
let simulationRunning = false;

const SIM_UNITS = [
  { name: 'Simón (Bot)', unitNumber: 91 },
  { name: 'Carlos (Bot)', unitNumber: 92 },
  { name: 'María (Bot)', unitNumber: 93 },
  { name: 'Pedro (Bot)', unitNumber: 94 }
];

// ~30 km/h = ~8.33 m/s. En 3 segundos recorre ~25 metros.
// 25 metros en grados ≈ 0.000225 (latitud) o similar en longitud.
const SIM_INTERVAL_MS = 3000;
const STEP_SIZE = 0.000225; // ~25 m por tick

app.post('/api/simulation/start', (req, res) => {
  if (simulationRunning) {
    return res.status(400).json({ error: 'La simulación ya está en ejecución' });
  }

  const centerLat = req.body.latitude ?? -34.6037;
  const centerLon = req.body.longitude ?? -58.3816;

  const createdUnits = [];

  // Direcciones de movimiento para cada unidad:
  // Unidades 0 y 1 van en dirección similar (norte-noreste) pero con offset,
  // para que se crucen y disparen alertas de proximidad.
  // Unidades 2 y 3 van en otras direcciones.
  const directions = [
    { dLat: 1.0, dLon: 0.3 },   // Simón: norte-noreste
    { dLat: 0.9, dLon: 0.4 },   // Carlos: norte-noreste (similar a Simón)
    { dLat: -0.7, dLon: 0.7 },  // María: sureste
    { dLat: 0.0, dLon: -1.0 }   // Pedro: oeste
  ];

  // Offsets iniciales — Simón y Carlos arrancan muy cerca (~200m de diferencia)
  const startOffsets = [
    { lat: 0.0005, lon: 0.0005 },
    { lat: 0.0010, lon: 0.0008 },
    { lat: -0.003, lon: 0.002 },
    { lat: 0.002, lon: -0.003 }
  ];

  SIM_UNITS.forEach((simDef, idx) => {
    const id = uuidv4();
    const startLat = centerLat + startOffsets[idx].lat;
    const startLon = centerLon + startOffsets[idx].lon;

    const unit = {
      id,
      visibleId: visibleIdCounter++,
      name: simDef.name,
      lineNumber: 'Línea Roja',
      unitNumber: simDef.unitNumber,
      latitude: startLat,
      longitude: startLon,
      speed: 30,
      heading: 0,
      lastUpdate: new Date().toISOString(),
      active: true,
      socketId: null,
      simulated: true
    };

    units.set(id, unit);
    simulatedUnitIds.push(id);
    createdUnits.push(unit);

    console.log(`🤖 Unidad simulada creada: "${simDef.name}" (número ${simDef.unitNumber}) — ID: ${id}`);

    // Movimiento periódico
    const dir = directions[idx];
    let tick = 0;

    const interval = setInterval(() => {
      tick++;

      // Agregar un poco de variación sinusoidal para que las rutas no sean perfectamente rectas
      const wobble = Math.sin(tick * 0.15) * 0.3;
      const dLat = (dir.dLat + wobble * dir.dLon) * STEP_SIZE;
      const dLon = (dir.dLon - wobble * dir.dLat) * STEP_SIZE;

      unit.latitude += dLat;
      unit.longitude += dLon;
      unit.heading = (Math.atan2(dLon, dLat) * 180) / Math.PI;
      unit.speed = 28 + Math.random() * 6; // 28-34 km/h
      unit.lastUpdate = new Date().toISOString();

      // Broadcast igual que una unidad real
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

      // Verificar proximidad
      checkProximity(unit);
    }, SIM_INTERVAL_MS);

    simulationIntervals.push(interval);
  });

  simulationRunning = true;
  console.log(`🤖 Simulación iniciada con ${createdUnits.length} unidades en (${centerLat}, ${centerLon})`);

  res.status(201).json({ message: 'Simulación iniciada', units: createdUnits });
});

app.post('/api/simulation/stop', (_req, res) => {
  if (!simulationRunning) {
    return res.status(400).json({ error: 'No hay simulación en ejecución' });
  }

  // Detener intervalos
  simulationIntervals.forEach((iv) => clearInterval(iv));
  simulationIntervals = [];

  // Marcar unidades simuladas como inactivas
  simulatedUnitIds.forEach((id) => {
    const unit = units.get(id);
    if (unit) {
      unit.active = false;
      console.log(`🤖 Unidad simulada detenida: "${unit.name}" (${id})`);
    }
  });

  simulatedUnitIds = [];
  simulationRunning = false;

  console.log('🤖 Simulación detenida');
  res.json({ message: 'Simulación detenida' });
});

app.get('/api/simulation/status', (_req, res) => {
  const simUnits = simulatedUnitIds.map((id) => units.get(id)).filter(Boolean);
  res.json({ running: simulationRunning, units: simUnits });
});

// ---------------------------------------------------------------------------
// Iniciar servidor
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Servidor de rastreo iniciado en puerto ${PORT}`);
  console.log(`📡 Esperando conexiones...`);
});
