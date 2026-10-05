const http = require('http');
require('dotenv').config();

const app = require('./src/app');
const wsServer = require('./src/websocket/wsServer');
const db = require('./src/config/db');

const PORT = parseInt(process.env.PORT || '3000', 10);

// Create HTTP Server wrapping the Express app
const server = http.createServer(app);

// Attach the WebSocket server to the same HTTP server instance
wsServer.init(server, '/ws/telemetry');

server.listen(PORT, () => {
  console.log('====================================================');
  console.log(`  FLEET COMMAND BACKEND API RUNNING ON PORT ${PORT}`);
  console.log(`  REST Endpoint: POST http://localhost:${PORT}/api/telemetry`);
  console.log(`  WebSocket URL: ws://localhost:${PORT}/ws/telemetry`);
  console.log('====================================================');
});

// Graceful Shutdown
function handleShutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Initiating graceful termination...`);
  
  wsServer.close();

  server.close(() => {
    console.log('[Server] HTTP listener closed.');
    db.pool.end(() => {
      console.log('[Server] Database pool drained. Process exiting.');
      process.exit(0);
    });
  });

  // Force exit if hanging
  setTimeout(() => {
    console.error('[Server] Forced shutdown timeout exceeded.');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
