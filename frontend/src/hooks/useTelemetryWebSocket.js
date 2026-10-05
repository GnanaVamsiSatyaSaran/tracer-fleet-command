import { useEffect, useRef, useState, useCallback } from 'react';

function getWsUrl() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  if (import.meta.env.VITE_API_URL) {
    const httpUrl = import.meta.env.VITE_API_URL;
    const wsProto = httpUrl.startsWith('https') ? 'wss://' : 'ws://';
    const host = httpUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `${wsProto}${host}/ws/telemetry`;
  }
  return 'ws://localhost:3000/ws/telemetry';
}

const WS_URL = getWsUrl();
const DEAD_RECKONING_MS  = 15_000;
const SPEED_HISTORY_SIZE = 20;

// ── KRC Geofence Target Anchor ─────────────────────────────────────────
export const KRC_COORDINATES = [17.782167, 83.377472];
export const GEOFENCE_RADIUS_METERS = 100; // Exact 100m radius as specified

// ── Certified Driver Roster Registry ──────────────────────────────────
export const DRIVER_REGISTRY = {
  'GITAM-BUS-01': {
    name: 'Ramesh K.',
    role: 'Senior Fleet Captain',
    route: 'Route 1 • North Gate ⇄ KRC',
    phone: '+91 98480 23114',
    shiftStart: '07:30 AM',
    rating: 4.9,
  },
  'GITAM-BUS-02': {
    name: 'Suresh V.',
    role: 'Campus Express Specialist',
    route: 'Route 2 • Beach Road ⇄ KRC',
    phone: '+91 98481 90422',
    shiftStart: '08:00 AM',
    rating: 4.8,
  },
  'GITAM-BUS-03': {
    name: 'Anand P.',
    role: 'Shuttle Operator',
    route: 'Route 3 • Hostels Loop ⇄ KRC',
    phone: '+91 98482 77153',
    shiftStart: '08:15 AM',
    rating: 4.7,
  },
};

// ── Realistic Campus Waypoints passing into KRC (100m zone) ───────────
const SIM_BUSES = [
  {
    assetId: 'GITAM-BUS-01',
    driver: DRIVER_REGISTRY['GITAM-BUS-01'],
    waypoints: [
      [17.783600, 83.376100], // North Gate
      [17.782900, 83.376800], // ICT Bhavan
      [17.782300, 83.377200], // Entering KRC perimeter
      [17.782167, 83.377472], // Exactly inside KRC 100m Hub
      [17.781800, 83.377900], // KRC East Gate
      [17.781200, 83.378400], // Management Block
      [17.780400, 83.377600], // Open Air Theatre
      [17.781300, 83.376300], // Science Block
      [17.782600, 83.375600], // Law Bhavan
    ],
    baseSpeed: 24,
  },
  {
    assetId: 'GITAM-BUS-02',
    driver: DRIVER_REGISTRY['GITAM-BUS-02'],
    waypoints: [
      [17.779800, 83.374500], // Yendada junction approach
      [17.780600, 83.375800], // South Academic Avenue
      [17.781400, 83.376800], // Approaching KRC
      [17.782100, 83.377400], // Inside KRC Hub
      [17.782700, 83.377900], // Beach Road turnoff
      [17.783300, 83.378700], // Beach gate
      [17.782500, 83.379200], // Coastal curve
      [17.781100, 83.378500], // Engineering quad
      [17.780200, 83.376200], // Student center
    ],
    baseSpeed: 19,
  },
  {
    assetId: 'GITAM-BUS-03',
    driver: DRIVER_REGISTRY['GITAM-BUS-03'],
    waypoints: [
      [17.784200, 83.375200], // Boys Hostel complex
      [17.783500, 83.376000], // Stadium road
      [17.782600, 83.376800], // Medical block
      [17.782167, 83.377472], // Inside KRC Hub
      [17.781600, 83.377100], // Central library quad
      [17.782400, 83.375800], // Girls Hostel link
    ],
    baseSpeed: 16,
  },
];

/**
 * Calculates geodesic distance in meters between two lat/lng coordinates (Haversine)
 */
export function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates human-readable Expected Campus Arrival (ETA) to KRC Hub
 */
export function calculateKrcEta(lat, lng, speedKmh, insideGeofence, isStale) {
  if (isStale) return { text: 'Signal Lost', badgeClass: 'text-rose-400 bg-rose-950/60 border-rose-800/60' };
  if (insideGeofence) return { text: 'At KRC Hub', badgeClass: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60' };

  const distMeters = calculateDistanceMeters(lat, lng, KRC_COORDINATES[0], KRC_COORDINATES[1]);
  if (distMeters <= GEOFENCE_RADIUS_METERS) {
    return { text: 'At KRC Hub', badgeClass: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60' };
  }

  if (speedKmh < 2) {
    return { text: 'Stationary (~' + Math.round(distMeters) + 'm)', badgeClass: 'text-amber-300 bg-amber-950/60 border-amber-800/60' };
  }

  const speedMetersPerMin = (speedKmh * 1000) / 60;
  const minutes = Math.max(1, Math.round(distMeters / speedMetersPerMin));
  return {
    text: `~${minutes} min (${Math.round(distMeters)}m)`,
    badgeClass: 'text-sky-300 bg-sky-950/60 border-sky-800/60',
  };
}

export function timeAgo(date) {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 5)  return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function useTelemetryWebSocket() {
  const [vehicles,     setVehicles]     = useState(new Map());
  const [wsStatus,     setWsStatus]     = useState('disconnected');
  const [geofenceLog,  setGeofenceLog]  = useState([]);
  const [isSimulating, setIsSimulating] = useState(false);

  const wsRef       = useRef(null);
  const retryRef    = useRef(null);
  const staleRef    = useRef(null);
  const simRef      = useRef(null);
  const prevGeoRef  = useRef(new Map());
  const retryCount  = useRef(0);
  const simStepRef  = useRef(new Map());

  // ── Dead Reckoning Watchdog (15s threshold) ──────────────────────────
  const startStaleTicker = useCallback(() => {
    if (staleRef.current) clearInterval(staleRef.current);
    staleRef.current = setInterval(() => {
      setVehicles(prev => {
        let changed = false;
        const next = new Map(prev);
        for (const [id, v] of next) {
          const isStale = Date.now() - v.lastPingTime.getTime() > DEAD_RECKONING_MS;
          if (isStale !== v.isStale) {
            next.set(id, { ...v, isStale });
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 2_500);
  }, []);

  // ── Upsert vehicle telemetry ─────────────────────────────────────────
  const upsertVehicle = useCallback((point, setV) => {
    const now = new Date();
    setV(prev => {
      const next     = new Map(prev);
      const existing = next.get(point.asset_id);
      const speed    = parseFloat(point.speed ?? 0);
      const lat      = parseFloat(point.latitude);
      const lng      = parseFloat(point.longitude);

      // Verify geofence against exact KRC 100m anchor
      const distToKrc = calculateDistanceMeters(lat, lng, KRC_COORDINATES[0], KRC_COORDINATES[1]);
      const insideGeofence = point.inside_geofence !== undefined
        ? !!point.inside_geofence
        : distToKrc <= GEOFENCE_RADIUS_METERS;

      const speedHistory = existing
        ? [...existing.speedHistory.slice(-(SPEED_HISTORY_SIZE - 1)), speed]
        : [speed, speed];

      const driver = DRIVER_REGISTRY[point.asset_id] || {
        name: 'Authorized Operator',
        role: 'Transit Crew',
        route: 'Campus Internal',
        phone: '+91 98480 00000',
        shiftStart: '08:00 AM',
        rating: 4.8,
      };

      const isStale = false;
      const eta = calculateKrcEta(lat, lng, speed, insideGeofence, isStale);

      const entry = {
        assetId:        point.asset_id,
        driver,
        lat,
        lng,
        speed,
        heading:        parseFloat(point.heading ?? 0),
        altitude:       parseFloat(point.altitude ?? 0),
        batteryLevel:   point.battery_level ?? 92,
        distToKrc:      Math.round(distToKrc),
        insideGeofence,
        eta,
        lastPingTime:   now,
        isStale,
        sessionId:      point.session_id ?? null,
        speedHistory,
      };
      next.set(point.asset_id, entry);

      const prev_inside = prevGeoRef.current.get(point.asset_id);
      if (prev_inside !== undefined && prev_inside !== insideGeofence) {
        setGeofenceLog(log => [
          {
            assetId: point.asset_id,
            driverName: driver.name,
            event: insideGeofence ? 'enter' : 'exit',
            time: now,
            distMeters: Math.round(distToKrc),
          },
          ...log.slice(0, 499),
        ]);
      }
      prevGeoRef.current.set(point.asset_id, insideGeofence);
      return next;
    });
  }, []);

  // ── Realistic Campus Fleet Simulation ─────────────────────────────────
  const startSimulation = useCallback(() => {
    if (simRef.current) return;
    setIsSimulating(true);
    setWsStatus('simulating');
    startStaleTicker();

    SIM_BUSES.forEach((b, i) => simStepRef.current.set(b.assetId, i * 2));

    const tick = () => {
      SIM_BUSES.forEach(b => {
        const idx = simStepRef.current.get(b.assetId) ?? 0;
        const curWp = b.waypoints[idx % b.waypoints.length];
        const nextWp = b.waypoints[(idx + 1) % b.waypoints.length];
        simStepRef.current.set(b.assetId, (idx + 1) % b.waypoints.length);

        // Heading calculation between waypoints
        const dLat = nextWp[0] - curWp[0];
        const dLng = nextWp[1] - curWp[1];
        const heading = (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360;

        const jitter = () => (Math.random() - 0.5) * 0.00015;
        const lat = curWp[0] + jitter();
        const lng = curWp[1] + jitter();

        const dist = calculateDistanceMeters(lat, lng, KRC_COORDINATES[0], KRC_COORDINATES[1]);
        const insideGeofence = dist <= GEOFENCE_RADIUS_METERS;
        const speed = insideGeofence ? 12 + Math.random() * 4 : b.baseSpeed + (Math.random() * 6 - 3);

        upsertVehicle({
          asset_id:       b.assetId,
          latitude:       lat,
          longitude:      lng,
          speed:          Math.max(0, speed),
          heading,
          altitude:       24,
          battery_level:  88 + Math.floor(Math.random() * 8),
          inside_geofence: insideGeofence,
          session_id:     'SIM-KRC-DISPATCH',
        }, setVehicles);
      });
    };

    tick(); // Immediate initial dispatch
    simRef.current = setInterval(tick, 2_200);
  }, [startStaleTicker, upsertVehicle]);

  const stopSimulation = useCallback(() => {
    clearInterval(simRef.current);
    simRef.current = null;
    setIsSimulating(false);
  }, []);

  // Stable refs for callbacks inside ws handlers
  const upsertRef = useRef(upsertVehicle);
  upsertRef.current = upsertVehicle;

  const startSimRef = useRef(startSimulation);
  startSimRef.current = startSimulation;

  const stopSimRef = useRef(stopSimulation);
  stopSimRef.current = stopSimulation;

  // ── WS Connection Manager ─────────────────────────────────────────────
  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }
    setWsStatus('connecting');

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus('connected');
      retryCount.current = 0;
      stopSimRef.current();
      startStaleTicker();
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.event === 'TELEMETRY_UPDATE' && Array.isArray(msg.data)) {
          msg.data.forEach(p => p.asset_id && upsertRef.current(p, setVehicles));
        }
      } catch { /* ignore parse error */ }
    };

    ws.onerror = () => setWsStatus('error');

    ws.onclose = () => {
      setWsStatus('disconnected');
      if (!simRef.current) {
        startSimRef.current();
      }
      const delay = Math.min(1000 * 2 ** retryCount.current, 10_000);
      retryCount.current += 1;
      retryRef.current = setTimeout(connect, delay);
    };
  }, [startStaleTicker]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(retryRef.current);
      clearInterval(staleRef.current);
      clearInterval(simRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { vehicles, wsStatus, geofenceLog, isSimulating };
}
