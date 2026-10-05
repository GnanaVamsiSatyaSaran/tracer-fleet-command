import { useState, useEffect, useRef, useCallback } from 'react';
import { useTelemetryWebSocket } from './hooks/useTelemetryWebSocket';
import Header from './components/Header';
import MapView from './components/MapView';
import FleetRosterPanel from './components/FleetRosterPanel';
import ReplayBar from './components/ReplayBar';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function App() {
  const { vehicles, wsStatus, geofenceLog, isSimulating } = useTelemetryWebSocket();
  const [selectedBusId, setSelectedBusId] = useState(null);

  // ── Dynamic Geofences State ───────────────────────────────────────────
  const [geofences, setGeofences] = useState([]);

  // Fetch geofences from server
  const fetchGeofences = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/geofences`);
      if (res.ok) {
        const data = await res.json();
        if (data.geofences) {
          setGeofences(data.geofences);
        }
      }
    } catch (err) {
      console.warn('[App] Could not fetch geofences from backend:', err.message);
    }
  }, []);

  useEffect(() => {
    fetchGeofences();
  }, [fetchGeofences]);

  const handleSaveGeofence = async (zoneData) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/geofences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(zoneData),
      });
      if (res.ok) {
        await fetchGeofences();
      }
    } catch (err) {
      console.error('[App] Failed to save geofence:', err);
    }
  };

  const handleDeleteGeofence = async (id) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/geofences/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setGeofences(prev => prev.filter(g => g.id !== id));
      }
    } catch (err) {
      console.error('[App] Failed to delete geofence:', err);
    }
  };

  // ── Historical Route Replay State ─────────────────────────────────────
  const [isReplayMode, setIsReplayMode] = useState(false);
  const [replayBusId, setReplayBusId] = useState('GITAM-BUS-01');
  const [replayDate, setReplayDate] = useState(new Date().toISOString().slice(0, 10));
  const [replayPoints, setReplayPoints] = useState([]);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLoadingReplay, setIsLoadingReplay] = useState(false);
  const playTimerRef = useRef(null);

  // Fetch historical route telemetry
  const fetchReplayRoute = useCallback(async (busId, date) => {
    setIsLoadingReplay(true);
    setIsPlaying(false);
    try {
      const targetBus = busId || 'GITAM-BUS-01';
      const targetDate = date || new Date().toISOString().slice(0, 10);
      const res = await fetch(`${BACKEND_URL}/api/telemetry/history?asset_id=${encodeURIComponent(targetBus)}&date=${encodeURIComponent(targetDate)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.points && data.points.length > 0) {
          setReplayPoints(data.points);
          setReplayIndex(0);
        } else {
          setReplayPoints([]);
        }
      }
    } catch (err) {
      console.error('[App] Failed to fetch replay history:', err);
    } finally {
      setIsLoadingReplay(false);
    }
  }, []);

  // When replay mode opens or bus changes, load route
  const handleOpenReplay = (targetBusId = null) => {
    const bus = targetBusId || selectedBusId || 'GITAM-BUS-01';
    setReplayBusId(bus);
    setIsReplayMode(true);
    fetchReplayRoute(bus, replayDate);
  };

  const handleSelectReplayBus = (busId) => {
    setReplayBusId(busId);
    fetchReplayRoute(busId, replayDate);
  };

  const handleChangeReplayDate = (date) => {
    setReplayDate(date);
    fetchReplayRoute(replayBusId, date);
  };

  // Animation Playback Interval
  useEffect(() => {
    if (!isPlaying || replayPoints.length === 0) {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      return;
    }

    const intervalMs = Math.max(100, Math.round(900 / playbackSpeed));
    playTimerRef.current = setInterval(() => {
      setReplayIndex(prev => {
        if (prev >= replayPoints.length - 1) {
          setIsPlaying(false); // Finished replay
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, playbackSpeed, replayPoints]);

  const handleTogglePlay = () => {
    if (replayPoints.length === 0) return;
    if (replayIndex >= replayPoints.length - 1) {
      setReplayIndex(0); // Rewind if at the end
    }
    setIsPlaying(!isPlaying);
  };

  const vehiclesList = Array.from(vehicles.values());

  return (
    <div className="flex flex-col h-screen w-screen bg-obsidian-bg text-slate-100 overflow-hidden select-none">
      {/* ── Top Enterprise Header Bar ─────────────────────────────── */}
      <Header
        wsStatus={wsStatus}
        vehicleCount={vehicles.size}
        isSimulating={isSimulating}
      />

      {/* ── Main Operations Workspace ─────────────────────────────── */}
      <main className="flex flex-1 min-h-0 w-full overflow-hidden relative">
        {/* Real-time Map with Radar waves and PostGIS Geofences */}
        <MapView
          vehicles={vehicles}
          selectedBusId={selectedBusId}
          onSelectBus={setSelectedBusId}
          isReplayMode={isReplayMode}
          replayPoints={replayPoints}
          replayIndex={replayIndex}
          replayBusId={replayBusId}
          geofences={geofences}
          onSaveGeofence={handleSaveGeofence}
          onDeleteGeofence={handleDeleteGeofence}
          onOpenReplay={() => handleOpenReplay()}
        />

        {/* Sliding Logistics Roster & Dispatch Action Hub */}
        <FleetRosterPanel
          vehicles={vehicles}
          geofenceLog={geofenceLog}
          isSimulating={isSimulating}
          selectedBusId={selectedBusId}
          onSelectBus={setSelectedBusId}
          onReplayBus={(busId) => handleOpenReplay(busId)}
        />

        {/* Floating Historical Route Replay Dock at Bottom */}
        <ReplayBar
          isOpen={isReplayMode}
          onClose={() => {
            setIsReplayMode(false);
            setIsPlaying(false);
          }}
          vehicles={vehiclesList.length > 0 ? vehiclesList : [
            { assetId: 'GITAM-BUS-01', driver: { name: 'Ramesh K.' } },
            { assetId: 'GITAM-BUS-02', driver: { name: 'Suresh V.' } },
            { assetId: 'GITAM-BUS-03', driver: { name: 'Venkat R.' } },
            { assetId: 'GITAM-BUS-04', driver: { name: 'Naresh P.' } },
          ]}
          selectedBusId={replayBusId}
          onSelectBus={handleSelectReplayBus}
          points={replayPoints}
          currentIndex={replayIndex}
          onSeek={setReplayIndex}
          isPlaying={isPlaying}
          onTogglePlay={handleTogglePlay}
          playbackSpeed={playbackSpeed}
          onChangeSpeed={setPlaybackSpeed}
          isLoading={isLoadingReplay}
          selectedDate={replayDate}
          onChangeDate={handleChangeReplayDate}
        />
      </main>
    </div>
  );
}
