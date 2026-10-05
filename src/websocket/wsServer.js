const WebSocket = require('ws');

class WebSocketServerManager {
  constructor() {
    this.wss = null;
    this.clients = new Set();
    this.heartbeatInterval = null;
  }

  /**
   * Initializes the WebSocket server attached to an existing HTTP/HTTPS server instance.
   * @param {import('http').Server} httpServer 
   * @param {string} [path='/ws/telemetry']
   */
  init(httpServer, path = '/ws/telemetry') {
    this.wss = new WebSocket.Server({ server: httpServer, path });

    this.wss.on('connection', (ws, req) => {
      const clientIp = req.socket.remoteAddress;
      ws.isAlive = true;
      this.clients.add(ws);

      console.log(`[WebSocket] Client connected: ${clientIp} | Active clients: ${this.clients.size}`);

      // Initial welcome handshake with current server time
      ws.send(JSON.stringify({
        event: 'CONNECTION_ESTABLISHED',
        message: 'Connected to Fleet Command Real-Time Telemetry Stream',
        connectedAt: new Date().toISOString(),
      }));

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', (message) => {
        try {
          const parsed = JSON.parse(message);
          // Handle client subscription or ping
          if (parsed.type === 'PING') {
            ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
          }
        } catch (_) {
          // Ignore unformatted raw payloads
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log(`[WebSocket] Client disconnected | Active clients: ${this.clients.size}`);
      });

      ws.on('error', (err) => {
        console.error('[WebSocket] Socket error:', err.message);
        this.clients.delete(ws);
      });
    });

    // Heartbeat check every 30 seconds to clean stale sockets
    this.heartbeatInterval = setInterval(() => {
      for (const ws of this.clients) {
        if (!ws.isAlive) {
          ws.terminate();
          this.clients.delete(ws);
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, 30000);

    console.log(`[WebSocket] Server listening on endpoint: ${path}`);
  }

  /**
   * Broadcasts updated telemetry points to all connected clients.
   * @param {string} event 
   * @param {Array|object} payload 
   */
  broadcast(event, payload) {
    if (!this.wss || this.clients.size === 0) return;

    const message = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      data: payload,
    });

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message, (err) => {
          if (err) {
            console.error('[WebSocket] Broadcast transmission error:', err.message);
          }
        });
      }
    }
  }

  /**
   * Returns current count of connected clients.
   * @returns {number}
   */
  getClientCount() {
    return this.clients.size;
  }

  /**
   * Graceful shutdown of the WebSocket server.
   */
  close() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.wss) {
      this.wss.close(() => {
        console.log('[WebSocket] Server terminated.');
      });
    }
  }
}

// Export singleton instance
module.exports = new WebSocketServerManager();
