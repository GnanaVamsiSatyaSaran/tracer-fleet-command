const express = require('express');
const telemetryRoutes = require('./routes/telemetryRoutes');
const geofenceRoutes = require('./routes/geofenceRoutes');
const assetRoutes = require('./routes/assetRoutes');
const personnelRoutes = require('./routes/personnelRoutes');
const { initializeDatabase } = require('./config/dbInit');

const app = express();

// Initialize Database Schemas and Extensions
initializeDatabase();

// Middleware
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Enable CORS for LAN mobile devices, cloud origins, and browser dashboards
const allowedOrigin = process.env.CORS_ORIGIN || '*';
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', allowedOrigin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path.startsWith('/api')) {
      console.log(`[HTTP] ${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
    }
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'HEALTHY',
    service: 'Fleet Command Transit Backend',
    timestamp: new Date().toISOString(),
  });
});

// Download Driver App APK Endpoint
const path = require('path');
app.get(['/download/apk', '/FleetTracker-v2.5.apk'], (req, res) => {
  const apkPath = path.join(__dirname, '..', 'FleetTracker-v2.5.apk');
  res.download(apkPath, 'FleetTracker-v2.5.apk');
});

// Mount Production API Routes
app.use('/api', telemetryRoutes);
app.use('/api', geofenceRoutes);
app.use('/api', assetRoutes);
app.use('/api', personnelRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]:', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
  });
});

module.exports = app;
