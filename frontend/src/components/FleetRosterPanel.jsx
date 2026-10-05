import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AnimatedCounter from './AnimatedCounter';
import { timeAgo } from '../hooks/useTelemetryWebSocket';

// ── Mini SVG Speed Sparkline ────────────────────────────────────────────────
function Sparkline({ data = [], color = '#fbbf24', width = 56, height = 22 }) {
  if (!data || data.length < 2) {
    return <span className="text-slate-600 text-[10px] font-mono">—</span>;
  }
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const last = data[data.length - 1];

  return (
    <div className="flex items-center gap-1.5">
      <svg width={width} height={height} className="shrink-0">
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {(() => {
          const [ex, ey] = pts.split(' ').pop().split(',').map(Number);
          return <circle cx={ex} cy={ey} r="2.2" fill={color} />;
        })()}
      </svg>
      <span className="font-mono text-slate-200 text-xs tabular-nums font-semibold">
        {last.toFixed(0)}
      </span>
    </div>
  );
}

// ── CSV Exporter ────────────────────────────────────────────────────────────
function exportCSV(geofenceLog) {
  const header = 'Asset ID,Driver,Event,Distance to KRC (m),Timestamp\n';
  const rows = geofenceLog.map(e =>
    `"${e.assetId}","${e.driverName || 'Driver'}","${e.event.toUpperCase()}","${e.distMeters || 0}","${e.time.toISOString()}"`
  ).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `krc-transit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FleetRosterPanel({
  vehicles,
  geofenceLog,
  isSimulating,
  onSelectBus,
  onReplayBus,
}) {
  const [logOpen, setLogOpen] = useState(false);
  const [activeMenuBusId, setActiveMenuBusId] = useState(null);
  const [dispatchToast, setDispatchToast] = useState(null);
  const [shiftLogModalBus, setShiftLogModalBus] = useState(null);

  // Convert vehicle map to prioritized roster list
  const roster = useMemo(() => {
    const list = [...vehicles.values()];
    return list.sort((a, b) => {
      if (a.isStale !== b.isStale) return a.isStale ? 1 : -1;
      return a.assetId.localeCompare(b.assetId);
    });
  }, [vehicles]);

  const insideCount = useMemo(() => {
    return roster.filter(v => v.insideGeofence && !v.isStale).length;
  }, [roster]);

  const activeCount = useMemo(() => {
    return roster.filter(v => !v.isStale).length;
  }, [roster]);

  // Show dispatch feedback toast
  const triggerDispatchAction = (actionName, bus) => {
    setActiveMenuBusId(null);
    if (actionName === 'replay') {
      if (onReplayBus) onReplayBus(bus.assetId);
      return;
    }
    if (actionName === 'shift_log') {
      setShiftLogModalBus(bus);
      return;
    }
    const message =
      actionName === 'ping'
        ? `📡 Pinged transponder on ${bus.assetId} (${bus.driver.name}) — 28ms ACK`
        : `💬 Priority message dispatched to driver ${bus.driver.name} via console`;

    setDispatchToast(message);
    setTimeout(() => setDispatchToast(null), 4000);
  };

  return (
    <aside className="relative flex flex-col w-[390px] shrink-0 bg-obsidian-panel/95 backdrop-blur-2xl border-l border-obsidian-border z-20 overflow-hidden shadow-2xl">
      {/* ── Dispatch Alert Toast Overlay ────────────────────────────── */}
      <AnimatePresence>
        {dispatchToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-3 left-3 right-3 z-50 p-3 rounded-lg glass-dropdown border border-amber-500/40 text-amber-300 text-xs font-medium shadow-amber-glow flex items-center justify-between"
          >
            <span>{dispatchToast}</span>
            <button
              onClick={() => setDispatchToast(null)}
              className="text-slate-400 hover:text-white ml-2 text-sm"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header & KPI Statistics ─────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-slate-800/80 bg-slate-900/40">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold tracking-wider text-slate-100 uppercase flex items-center gap-2">
              <span>Active Fleet Roster</span>
              {isSimulating && (
                <span className="text-[10px] font-mono tracking-widest font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full animate-pulse">
                  SIM MODE
                </span>
              )}
            </h2>
            <p className="text-[11px] text-slate-400 font-medium">
              Real-time transit operations & campus dispatch
            </p>
          </div>

          <div className="text-right">
            <span className="text-xs font-mono font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-1 rounded-md">
              KRC ZONE
            </span>
          </div>
        </div>

        {/* Fleet KPI Metric Grid */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-800/60 border border-slate-700/40 rounded-lg p-2.5">
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Active</div>
            <div className="text-lg font-bold text-slate-100 font-mono flex items-center gap-1">
              <AnimatedCounter value={activeCount} />
              <span className="text-[10px] text-slate-500 font-normal">buses</span>
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/40 rounded-lg p-2.5">
            <div className="text-[10px] text-emerald-400 uppercase font-semibold">In KRC Hub</div>
            <div className="text-lg font-bold text-emerald-400 font-mono flex items-center gap-1">
              <AnimatedCounter value={insideCount} />
              <span className="text-[10px] text-emerald-600 font-normal">units</span>
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/40 rounded-lg p-2.5">
            <div className="text-[10px] text-amber-400 uppercase font-semibold">In Transit</div>
            <div className="text-lg font-bold text-amber-400 font-mono flex items-center gap-1">
              <AnimatedCounter value={Math.max(0, activeCount - insideCount)} />
              <span className="text-[10px] text-amber-600 font-normal">en-route</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Active Fleet Roster Cards / Table ───────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 min-h-0">
        {roster.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-4">
            <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 mb-2">
              🚌
            </div>
            <p className="text-xs font-semibold text-slate-300">Awaiting Vehicle Pings</p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-[200px]">
              {isSimulating ? 'Connecting to simulated telemetry telemetry stream...' : 'Waiting for incoming GPS telemetry...'}
            </p>
          </div>
        ) : (
          roster.map(v => {
            const isMenuOpen = activeMenuBusId === v.assetId;
            const etaBadge = v.eta || { text: 'Calculating', badgeClass: 'text-slate-400' };

            return (
              <motion.div
                key={v.assetId}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                onClick={() => onSelectBus && onSelectBus(v.assetId)}
                className={`relative rounded-xl border p-3 transition-all cursor-pointer ${
                  v.isStale
                    ? 'bg-slate-900/50 border-rose-900/40 opacity-60'
                    : 'bg-slate-800/70 hover:bg-slate-800/90 hover:border-amber-400/50 border-slate-700/60 shadow-lg'
                }`}
              >
                {/* Top Row: Vehicle ID, Status, Action Dots */}
                <div className="flex items-start justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-extrabold text-amber-400 bg-amber-400/10 border border-amber-400/25 px-2 py-0.5 rounded">
                      {v.assetId}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        v.isStale
                          ? 'bg-rose-950/70 text-rose-400 border-rose-800/60'
                          : v.insideGeofence
                          ? 'bg-emerald-950/70 text-emerald-400 border-emerald-800/60'
                          : 'bg-sky-950/70 text-sky-400 border-sky-800/60'
                      }`}
                    >
                      {v.isStale ? 'SIGNAL LOST' : v.insideGeofence ? 'INSIDE KRC' : 'IN TRANSIT'}
                    </span>
                  </div>

                  {/* Three-Dot Action Trigger Button */}
                  <div className="relative">
                    <button
                      onClick={() => setActiveMenuBusId(isMenuOpen ? null : v.assetId)}
                      className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
                      title="Dispatch options"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <circle cx="8" cy="3" r="1.5" />
                        <circle cx="8" cy="8" r="1.5" />
                        <circle cx="8" cy="13" r="1.5" />
                      </svg>
                    </button>

                    {/* Popover Action Menu */}
                    <AnimatePresence>
                      {isMenuOpen && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -5 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -5 }}
                          className="absolute right-0 top-7 w-48 rounded-xl glass-dropdown border border-slate-700 p-1.5 z-50 shadow-2xl"
                        >
                          <button
                            onClick={() => triggerDispatchAction('ping', v)}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-200 hover:bg-amber-500/20 hover:text-amber-300 flex items-center gap-2 transition-colors"
                          >
                            <span>📡</span>
                            <span>Ping Device</span>
                          </button>
                          <button
                            onClick={() => triggerDispatchAction('message', v)}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-200 hover:bg-amber-500/20 hover:text-amber-300 flex items-center gap-2 transition-colors"
                          >
                            <span>💬</span>
                            <span>Message Driver</span>
                          </button>
                          <button
                            onClick={() => triggerDispatchAction('shift_log', v)}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-200 hover:bg-amber-500/20 hover:text-amber-300 flex items-center gap-2 transition-colors border-t border-slate-800 mt-1 pt-1"
                          >
                            <span>📜</span>
                            <span>View Shift Log</span>
                          </button>
                          <button
                            onClick={() => triggerDispatchAction('replay', v)}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold text-cyan-neon hover:bg-cyan-neon/20 flex items-center gap-2 transition-colors border-t border-slate-800 mt-1 pt-1"
                          >
                            <span>🧭</span>
                            <span>Replay Route History</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Driver Identity & Assigned Route */}
                <div className="flex items-center justify-between text-xs mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">👤</span>
                    <span className="font-semibold text-slate-200">{v.driver?.name}</span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {timeAgo(v.lastPingTime)}
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 mb-2 truncate font-medium">
                  {v.driver?.route}
                </div>

                {/* Expected Campus Arrival (ETA) Pill */}
                <div className="flex items-center justify-between bg-slate-900/60 rounded-lg p-2 border border-slate-800/80 mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">ETA to KRC:</span>
                    <span className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded border ${etaBadge.badgeClass}`}>
                      {etaBadge.text}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {v.distToKrc}m away
                  </div>
                </div>

                {/* Bottom Row: Speed Sparkline + Battery */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-700/40 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 uppercase font-medium">Speed:</span>
                    {v.isStale ? (
                      <span className="text-slate-500 font-mono text-xs">—</span>
                    ) : (
                      <Sparkline data={v.speedHistory} color="#fbbf24" />
                    )}
                    <span className="text-[10px] text-slate-500 font-mono">km/h</span>
                  </div>

                  <div className="flex items-center gap-1 text-[11px] text-slate-300 font-mono">
                    <span>🔋</span>
                    <span>{v.batteryLevel ?? 92}%</span>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* ── Campus Entry / Exit Historical Dwell Drawer ──────────────── */}
      <div className="border-t border-slate-800 bg-slate-900/60 p-3">
        <button
          onClick={() => setLogOpen(o => !o)}
          className="w-full flex items-center justify-between text-xs font-bold text-slate-300 uppercase tracking-wider hover:text-white transition-colors"
        >
          <span className="flex items-center gap-2">
            <span>🏛️</span>
            <span>Campus KRC Transit Log</span>
          </span>
          <span className="flex items-center gap-2 font-mono">
            <span className="text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20 text-[10px]">
              {geofenceLog.length} events
            </span>
            <span>{logOpen ? '▲' : '▼'}</span>
          </span>
        </button>

        <AnimatePresence>
          {logOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-2 max-h-44 overflow-y-auto space-y-1.5 pr-1 border-t border-slate-800 pt-2"
            >
              {geofenceLog.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-500 font-mono">
                  NO ENTRY/EXIT DETECTED TODAY
                </div>
              ) : (
                geofenceLog.map((log, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs p-1.5 rounded bg-slate-800/50 border border-slate-800 font-mono"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          log.event === 'enter' ? 'bg-emerald-400 shadow-emerald-glow' : 'bg-amber-400'
                        }`}
                      />
                      <span className="font-bold text-amber-400">{log.assetId}</span>
                      <span className="text-slate-300">
                        {log.event === 'enter' ? 'ENTERED' : 'EXITED'} KRC HUB
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {log.time.toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* CSV Export Button */}
        <button
          onClick={() => exportCSV(geofenceLog)}
          disabled={geofenceLog.length === 0}
          className="mt-3 w-full py-2.5 rounded-lg text-xs font-bold tracking-wider uppercase
                     bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-glow
                     transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
        >
          <span>📥</span>
          <span>Export KRC Transit CSV</span>
        </button>
      </div>

      {/* ── Driver Shift Log Modal Overlay ──────────────────────────── */}
      <AnimatePresence>
        {shiftLogModalBus && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5 shadow-2xl text-slate-100"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold">
                    📜
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">Driver Shift Log</h3>
                    <p className="text-[11px] text-slate-400">{shiftLogModalBus.assetId}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShiftLogModalBus(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between p-2 rounded bg-slate-800/60">
                  <span className="text-slate-400">Assigned Driver:</span>
                  <span className="font-semibold text-amber-400">{shiftLogModalBus.driver.name}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-slate-800/60">
                  <span className="text-slate-400">Designation:</span>
                  <span className="text-slate-200">{shiftLogModalBus.driver.role}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-slate-800/60">
                  <span className="text-slate-400">Route Assigned:</span>
                  <span className="text-slate-200">{shiftLogModalBus.driver.route}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-slate-800/60">
                  <span className="text-slate-400">Shift Started:</span>
                  <span className="font-mono text-emerald-400">{shiftLogModalBus.driver.shiftStart}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-slate-800/60">
                  <span className="text-slate-400">Driver Rating:</span>
                  <span className="text-amber-400">★ {shiftLogModalBus.driver.rating} / 5.0</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-slate-800/60">
                  <span className="text-slate-400">Direct Contact:</span>
                  <span className="font-mono text-sky-400">{shiftLogModalBus.driver.phone}</span>
                </div>
              </div>

              <button
                onClick={() => setShiftLogModalBus(null)}
                className="mt-5 w-full py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-semibold text-slate-200 transition-colors"
              >
                Close Shift Details
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </aside>
  );
}
