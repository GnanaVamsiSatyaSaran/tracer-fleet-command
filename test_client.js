/**
 * Demonstration Script: Fleet Command End-to-End Test Client
 * 1. Connects to ws://localhost:3000/ws/telemetry
 * 2. Sends sample batch GPS telemetry to POST http://localhost:3000/api/telemetry
 * 3. Listens for real-time WebSocket broadcast containing the evaluated coordinates
 */
const WebSocket = require('ws');

const HTTP_URL = 'http://localhost:3000/api/telemetry';
const WS_URL = 'ws://localhost:3000/ws/telemetry';

console.log('Connecting to WebSocket server at:', WS_URL);
const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('[Test Client] Connected to WebSocket stream!');

  // Simulate on-vehicle GPS batch payload
  const sampleBatch = {
    telemetry: [
      {
        asset_id: '11111111-1111-1111-1111-111111111111',
        session_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        latitude: 17.782167,  // Exactly at Campus Center
        longitude: 83.377500,
        speed: 22.5,
        heading: 90.0,
        altitude: 14.5,
        battery_level: 95.0,
        recorded_at: new Date().toISOString()
      },
      {
        asset_id: '11111111-1111-1111-1111-111111111111',
        session_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        latitude: 17.818000,  // Far outside (~4 km away)
        longitude: 83.345000,
        speed: 45.0,
        heading: 270.0,
        altitude: 20.0,
        battery_level: 94.0,
        recorded_at: new Date().toISOString()
      }
    ]
  };

  console.log('[Test Client] Sending batch telemetry to API...');
  fetch(HTTP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sampleBatch)
  })
    .then(res => res.json())
    .then(data => {
      console.log('[Test Client] API Response:', JSON.stringify(data, null, 2));
    })
    .catch(err => {
      console.error('[Test Client] API Request failed:', err.message);
    });
});

ws.on('message', (msg) => {
  console.log('\n[Test Client] RECEIVED WEBSOCKET BROADCAST:');
  console.log(JSON.stringify(JSON.parse(msg), null, 2));
  ws.close();
});

ws.on('error', (err) => {
  console.error('[Test Client] WebSocket connection error:', err.message);
});
