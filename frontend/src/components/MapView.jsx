import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw';
import { KRC_COORDINATES, GEOFENCE_RADIUS_METERS } from '../hooks/useTelemetryWebSocket';
import GeofenceModal from './GeofenceModal';
import GeofenceManagerModal from './GeofenceManagerModal';
import { Shield, Layers, Navigation } from 'lucide-react';

const DEFAULT_ZOOM = 17;
const liveMarkerRegistry = new Map(); // assetId → L.Marker

/**
 * Creates custom HTML marker with concentric pulsing radar waves radiating outward (Electric Amber #FFB800)
 */
function createRadarDivIcon(vehicle) {
  const { assetId, heading = 0, speed = 0, isStale = false } = vehicle;
  const staleClass = isStale ? ' radar-marker-stale' : '';

  const html = `
    <div class="radar-marker-container${staleClass}">
      ${!isStale ? '<div class="radar-ring"></div><div class="radar-ring-delayed"></div>' : ''}
      
      <!-- Directional Heading Pointer & Bus Pin -->
      <div class="radar-core" style="transform: rotate(${heading}deg);">
        <div class="radar-heading"></div>
        <div class="radar-glyph" style="transform: rotate(-${heading}deg);">
          🚌
        </div>
      </div>

      <!-- Floating HUD Label Tag -->
      <div class="radar-tag${isStale ? ' radar-tag-stale' : ''}">
        <span>${assetId}</span>
        <span style="opacity: 0.5;">•</span>
        <span style="color: #F1F5F9; font-weight: 500;">${isStale ? 'OFFLINE' : `${speed.toFixed(0)}kph`}</span>
      </div>
    </div>
  `;

  return L.divIcon({
    className: '',
    iconSize: [60, 60],
    iconAnchor: [30, 30],
    popupAnchor: [0, -32],
    html,
  });
}

/**
 * Creates Knowledge Resource Centre (KRC) landmark center badge (Obsidian & Neon Cyan)
 */
function createKrcCenterIcon() {
  const html = `
    <div style="
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      transform: translate(-50%, -50%);
      pointer-events: auto;
    ">
      <div style="
        background: #1A2332;
        border: 2px solid #00F0FF;
        border-radius: 9999px;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 20px rgba(0, 240, 255, 0.65), 0 4px 12px rgba(0,0,0,0.85);
        font-size: 15px;
      ">
        🏛️
      </div>
      <div style="
        margin-top: 4px;
        background: rgba(26, 35, 50, 0.95);
        border: 1px solid rgba(0, 240, 255, 0.6);
        color: #00F0FF;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.08em;
        padding: 2px 8px;
        border-radius: 9999px;
        white-space: nowrap;
        font-family: 'JetBrains Mono', monospace;
        backdrop-filter: blur(14px);
        box-shadow: 0 4px 14px rgba(0,0,0,0.7);
      ">
        KRC HUB • 100M CORE ZONE
      </div>
    </div>
  `;

  return L.divIcon({
    className: '',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html,
  });
}

export default function MapView({
  vehicles,
  selectedBusId,
  onSelectBus,
  isReplayMode = false,
  replayPoints = [],
  replayIndex = 0,
  replayBusId = null,
  geofences = [],
  onSaveGeofence,
  onDeleteGeofence,
  onOpenReplay,
}) {
  const mapContainerRef = useRef(null);
  const leafletMapRef   = useRef(null);
  const drawnItemsRef   = useRef(null);
  const geofenceLayersRef = useRef(new Map()); // id → L.Layer

  // Replay map layers refs
  const replayFullPolylineRef = useRef(null);
  const replayTraversedPolylineRef = useRef(null);
  const replayMarkerRef = useRef(null);

  // Modals state
  const [isDrawModalOpen, setIsDrawModalOpen] = useState(false);
  const [isManagerModalOpen, setIsManagerModalOpen] = useState(false);
  const [pendingCoordinates, setPendingCoordinates] = useState([]);
  const [pendingLayer, setPendingLayer] = useState(null);

  // ── 1. Initialize Map, Tiles, KRC Zone, and Leaflet-Draw ───────────────
  useEffect(() => {
    if (leafletMapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: KRC_COORDINATES,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: true,
      maxZoom: 19,
      minZoom: 14,
    });

    // Custom Top-Left Zoom Control
    L.control.zoom({ position: 'topleft' }).addTo(map);

    // Dark Map Tile Layer (OSM)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      subdomains: 'abc',
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> • GITAM Fleet Command',
      maxZoom: 19,
    }).addTo(map);

    // Feature group for leaflet-draw layers
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnItemsRef.current = drawnItems;

    // Initialize Leaflet Draw Control
    const drawControl = new L.Control.Draw({
      position: 'topleft',
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: {
            color: '#00F0FF',
            fillColor: '#00F0FF',
            fillOpacity: 0.15,
            weight: 2.5,
          },
        },
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: false,
        polyline: false,
      },
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
    });
    map.addControl(drawControl);

    // Capture drawn polygon event
    map.on(L.Draw.Event.CREATED, (e) => {
      const layer = e.layer;
      drawnItems.addLayer(layer);
      
      const latLngs = layer.getLatLngs();
      const coords = Array.isArray(latLngs[0])
        ? latLngs[0].map(pt => [pt.lat, pt.lng])
        : latLngs.map(pt => [pt.lat, pt.lng]);

      setPendingCoordinates(coords);
      setPendingLayer(layer);
      setIsDrawModalOpen(true);
    });

    // Exact 100-Meter Neon Cyan Geofence around KRC
    L.circle(KRC_COORDINATES, {
      radius: GEOFENCE_RADIUS_METERS,
      className: 'krc-geofence-perimeter',
      interactive: false,
    }).addTo(map);

    // KRC Center Landmark Marker
    L.marker(KRC_COORDINATES, {
      icon: createKrcCenterIcon(),
      interactive: false,
      zIndexOffset: 100,
    }).addTo(map);

    leafletMapRef.current = map;

    return () => {
      liveMarkerRegistry.forEach(m => m.remove());
      liveMarkerRegistry.clear();
      map.remove();
      leafletMapRef.current = null;
    };
  }, []);

  // ── 2. Sync Dynamic Geofences from Server onto Map ────────────────────
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    // Remove old layers no longer in list
    const currentIds = new Set(geofences.map(g => g.id));
    for (const [id, layer] of geofenceLayersRef.current) {
      if (!currentIds.has(id)) {
        layer.remove();
        geofenceLayersRef.current.delete(id);
      }
    }

    // Add / update geofence layers
    geofences.forEach(zone => {
      if (zone.id === 'krc-hub-default') return; // Handled by fixed KRC circle
      if (geofenceLayersRef.current.has(zone.id)) return; // Already rendered

      if (zone.type === 'circle' && zone.center) {
        const circle = L.circle(zone.center, {
          radius: zone.radius_meters || 100,
          color: zone.color || '#00F0FF',
          className: 'neon-cyan-geofence',
          fillOpacity: 0.12,
        }).addTo(map);

        circle.bindTooltip(`<b>${zone.name}</b>`, {
          permanent: false,
          direction: 'center',
          className: 'custom-dark-popup',
        });

        geofenceLayersRef.current.set(zone.id, circle);
      } else if (zone.coordinates && zone.coordinates.length >= 3) {
        const poly = L.polygon(zone.coordinates, {
          color: zone.color || '#00F0FF',
          className: 'neon-cyan-geofence',
          fillOpacity: 0.12,
        }).addTo(map);

        poly.bindTooltip(`<b>${zone.name}</b>`, {
          permanent: false,
          direction: 'center',
          className: 'custom-dark-popup',
        });

        geofenceLayersRef.current.set(zone.id, poly);
      }
    });
  }, [geofences]);

  // ── 3. Trigger manual polygon draw programmatically ──────────────────
  const triggerManualDraw = () => {
    const map = leafletMapRef.current;
    if (!map) return;
    const polygonDrawer = new L.Draw.Polygon(map, {
      shapeOptions: {
        color: '#00F0FF',
        fillColor: '#00F0FF',
        fillOpacity: 0.15,
        weight: 2.5,
      },
    });
    polygonDrawer.enable();
  };

  const handleSaveDrawnZone = async (zoneData) => {
    if (onSaveGeofence) {
      await onSaveGeofence(zoneData);
    }
    // Remove the temporary layer from drawnItems since it will be rendered from geofences state
    if (pendingLayer && drawnItemsRef.current) {
      drawnItemsRef.current.removeLayer(pendingLayer);
    }
    setPendingLayer(null);
    setPendingCoordinates([]);
  };

  const handleDiscardDrawnZone = () => {
    if (pendingLayer && drawnItemsRef.current) {
      drawnItemsRef.current.removeLayer(pendingLayer);
    }
    setPendingLayer(null);
    setPendingCoordinates([]);
    setIsDrawModalOpen(false);
  };

  // ── 4. Live Vehicle Markers Sync ─────────────────────────────────────
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    // If Replay mode is active, hide live markers to focus on historical route
    if (isReplayMode) {
      liveMarkerRegistry.forEach(m => m.setOpacity(0.2));
      return;
    } else {
      liveMarkerRegistry.forEach(m => m.setOpacity(1));
    }

    const currentAssetIds = new Set();

    vehicles.forEach((v, assetId) => {
      currentAssetIds.add(assetId);
      if (!isFinite(v.lat) || !isFinite(v.lng)) return;

      const latLng = L.latLng(v.lat, v.lng);

      if (liveMarkerRegistry.has(assetId)) {
        const marker = liveMarkerRegistry.get(assetId);
        marker.setLatLng(latLng);
        marker.setIcon(createRadarDivIcon(v));
      } else {
        const marker = L.marker(latLng, {
          icon: createRadarDivIcon(v),
          title: assetId,
          riseOnHover: true,
          zIndexOffset: 500,
        }).addTo(map);

        marker.on('click', () => {
          if (onSelectBus) onSelectBus(assetId);
        });

        marker.bindPopup(
          `
            <div style="font-family:'Plus Jakarta Sans',sans-serif; min-width:180px; padding:2px;">
              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                <span style="font-family:'JetBrains Mono',monospace; font-weight:700; color:#FFB800; font-size:13px;">${assetId}</span>
                <span style="font-size:10px; background:rgba(0,240,255,0.15); color:#00F0FF; padding:1px 6px; border-radius:4px;">${v.insideGeofence ? 'IN HUB' : 'TRANSIT'}</span>
              </div>
              <div style="font-size:12px; color:#E2E8F0; font-weight:600; margin-bottom:2px;">${v.driver?.name || 'Assigned Driver'}</div>
              <div style="font-size:11px; color:#94A3B8; margin-bottom:8px;">${v.driver?.route || 'Campus Route'}</div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:11px; border-top:1px solid #273549; padding-top:6px;">
                <div><span style="color:#64748B;">Speed:</span> <b>${v.speed.toFixed(1)} km/h</b></div>
                <div><span style="color:#64748B;">Dist:</span> <b>${v.distToKrc}m to KRC</b></div>
              </div>
            </div>
          `,
          { closeButton: false, className: 'custom-dark-popup' }
        );

        liveMarkerRegistry.set(assetId, marker);
      }
    });

    // Cleanup decommissioned markers
    for (const [id, marker] of liveMarkerRegistry) {
      if (!currentAssetIds.has(id)) {
        marker.remove();
        liveMarkerRegistry.delete(id);
      }
    }
  }, [vehicles, onSelectBus, isReplayMode]);

  // ── 5. Replay Mode Route Polylines & Animated Bus Marker ─────────────
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    if (!isReplayMode || replayPoints.length === 0) {
      // Cleanup replay layers when replay mode closes
      if (replayFullPolylineRef.current) {
        replayFullPolylineRef.current.remove();
        replayFullPolylineRef.current = null;
      }
      if (replayTraversedPolylineRef.current) {
        replayTraversedPolylineRef.current.remove();
        replayTraversedPolylineRef.current = null;
      }
      if (replayMarkerRef.current) {
        replayMarkerRef.current.remove();
        replayMarkerRef.current = null;
      }
      return;
    }

    const allCoords = replayPoints.map(p => [p.latitude, p.longitude]);
    const traversedCoords = replayPoints.slice(0, replayIndex + 1).map(p => [p.latitude, p.longitude]);
    const currentPoint = replayPoints[replayIndex] || replayPoints[0];

    // Full Route Polyline (Neon Cyan glow)
    if (!replayFullPolylineRef.current) {
      replayFullPolylineRef.current = L.polyline(allCoords, {
        color: '#00F0FF',
        weight: 3.5,
        opacity: 0.5,
        dashArray: '6, 6',
        className: 'replay-route-line',
      }).addTo(map);

      // Fit bounds to entire historical route
      map.fitBounds(L.latLngBounds(allCoords).pad(0.2), { duration: 1.2 });
    }

    // Traversed Route Polyline (Electric Amber active track)
    if (!replayTraversedPolylineRef.current) {
      replayTraversedPolylineRef.current = L.polyline(traversedCoords, {
        color: '#FFB800',
        weight: 4.5,
        opacity: 0.95,
        className: 'replay-route-traversed',
      }).addTo(map);
    } else {
      replayTraversedPolylineRef.current.setLatLngs(traversedCoords);
    }

    // Animated Replay Vehicle Marker (Electric Amber #FFB800)
    if (currentPoint) {
      const vehiclePayload = {
        assetId: replayBusId || currentPoint.asset_id || 'REPLAY-BUS',
        heading: currentPoint.heading,
        speed: currentPoint.speed,
        isStale: false,
      };

      const latLng = [currentPoint.latitude, currentPoint.longitude];

      if (!replayMarkerRef.current) {
        replayMarkerRef.current = L.marker(latLng, {
          icon: createRadarDivIcon(vehiclePayload),
          zIndexOffset: 1000,
        }).addTo(map);
      } else {
        replayMarkerRef.current.setLatLng(latLng);
        replayMarkerRef.current.setIcon(createRadarDivIcon(vehiclePayload));
      }

      // Smooth pan map along route if vehicle near edges
      if (!map.getBounds().pad(-0.15).contains(latLng)) {
        map.panTo(latLng, { duration: 0.5 });
      }
    }
  }, [isReplayMode, replayPoints, replayIndex, replayBusId]);

  // Recenter map on KRC
  const handleRecenterKrc = () => {
    if (leafletMapRef.current) {
      leafletMapRef.current.flyTo(KRC_COORDINATES, DEFAULT_ZOOM, {
        duration: 1.2,
        easeLinearity: 0.25,
      });
    }
  };

  // Fit bounds to include fleet
  const handleFitFleet = () => {
    if (!leafletMapRef.current || vehicles.size === 0) return;
    const group = [KRC_COORDINATES];
    vehicles.forEach(v => {
      if (isFinite(v.lat) && isFinite(v.lng)) group.push([v.lat, v.lng]);
    });
    leafletMapRef.current.fitBounds(L.latLngBounds(group).pad(0.25));
  };

  return (
    <div className="relative flex-1 min-h-0 h-full w-full bg-obsidian-bg">
      {/* Map DOM Container */}
      <div ref={mapContainerRef} className="absolute inset-0" />

      {/* Floating Map HUD Navigation Buttons Top-Right */}
      <div className="absolute top-4 right-4 z-[400] flex items-center gap-2">
        {/* Draw Geofence Zone Button */}
        <button
          onClick={triggerManualDraw}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                     glass-panel text-xs font-semibold text-slate-200
                     hover:text-cyan-neon hover:border-cyan-neon/50
                     transition-all active:scale-95 shadow-glass"
          title="Draw new polygon geofence zone"
        >
          <Shield className="w-3.5 h-3.5 text-cyan-neon" />
          <span>Draw Zone</span>
        </button>

        {/* Manage Geofences */}
        <button
          onClick={() => setIsManagerModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                     glass-panel text-xs font-semibold text-slate-200
                     hover:text-cyan-neon hover:border-cyan-neon/50
                     transition-all active:scale-95 shadow-glass"
          title="Manage registered geofence zones"
        >
          <Layers className="w-3.5 h-3.5 text-cyan-neon" />
          <span>Zones ({geofences.length})</span>
        </button>

        {/* Route Replay Mode Toggle */}
        <button
          onClick={onOpenReplay}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                     glass-panel text-xs font-semibold transition-all active:scale-95 shadow-glass ${
                       isReplayMode
                         ? 'text-cyan-neon border-cyan-neon shadow-cyan-glow'
                         : 'text-slate-200 hover:text-amber-electric hover:border-amber-electric/50'
                     }`}
          title="Historical Route Replay"
        >
          <Navigation className="w-3.5 h-3.5 text-amber-electric" />
          <span>{isReplayMode ? 'Replay Active' : 'Route Replay'}</span>
        </button>

        {/* Fit Fleet */}
        <button
          onClick={handleFitFleet}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                     glass-panel text-xs font-semibold text-slate-200
                     hover:text-cyan-neon hover:border-cyan-neon/50
                     transition-all active:scale-95 shadow-glass"
          title="Zoom to fit all active vehicles"
        >
          <span>🎯</span>
          <span>Fit Fleet</span>
        </button>

        {/* Recenter KRC */}
        <button
          onClick={handleRecenterKrc}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                     glass-panel text-xs font-semibold text-slate-200
                     hover:text-cyan-neon hover:border-cyan-neon/50
                     transition-all active:scale-95 shadow-glass group"
          title="Recenter on Knowledge Resource Centre"
        >
          <span className="text-cyan-neon group-hover:scale-110 transition-transform">🏛️</span>
          <span>Center KRC Hub</span>
        </button>
      </div>

      {/* Geofence & Transponder Legend Pill Bottom-Left */}
      <div className="absolute bottom-6 left-4 z-[400] glass-panel px-3.5 py-2 rounded-xl text-xs flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-neon shadow-cyan-glow animate-pulse" />
          <span className="text-slate-300 font-medium">Neon Cyan Geofence Zones</span>
        </div>
        <span className="text-slate-600">|</span>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-electric shadow-amber-glow" />
          <span className="text-slate-300 font-medium">Electric Amber Radar Markers</span>
        </div>
      </div>

      {/* Geofence Creation Modal */}
      <GeofenceModal
        isOpen={isDrawModalOpen}
        coordinates={pendingCoordinates}
        onClose={handleDiscardDrawnZone}
        onSave={handleSaveDrawnZone}
      />

      {/* Geofence Manager Modal */}
      <GeofenceManagerModal
        isOpen={isManagerModalOpen}
        geofences={geofences}
        onClose={() => setIsManagerModalOpen(false)}
        onDeleteGeofence={onDeleteGeofence}
        onTriggerDraw={triggerManualDraw}
      />
    </div>
  );
}
