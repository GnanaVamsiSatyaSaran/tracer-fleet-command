import { useState, useEffect } from 'react';
import AnimatedCounter from './AnimatedCounter';
import { SlidersHorizontal } from 'lucide-react';

export default function Header({ wsStatus, vehicleCount, isSimulating, onOpenFleetManager }) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const statusConfig = {
    connected:  { dot: 'bg-emerald-400', ring: 'shadow-emerald-glow', text: 'TRANSIT MESH LIVE', pill: 'text-emerald-400 bg-emerald-950/70 border-emerald-800/60' },
    simulating: { dot: 'bg-amber-400',   ring: 'shadow-amber-glow animate-pulse', text: 'KRC SIMULATION RUNNING', pill: 'text-amber-400 bg-amber-950/70 border-amber-800/60' },
    connecting: { dot: 'bg-sky-400',     ring: '', text: 'ACQUIRING TELEMETRY…', pill: 'text-sky-400 bg-sky-950/70 border-sky-800/60' },
    disconnected: { dot: 'bg-slate-500', ring: '', text: 'STANDBY', pill: 'text-slate-400 bg-slate-800 border-slate-700' },
    error:      { dot: 'bg-rose-500',    ring: '', text: 'TELEMETRY FAULT', pill: 'text-rose-400 bg-rose-950/70 border-rose-800/60' },
  };

  const currentStatus = statusConfig[wsStatus] ?? statusConfig.disconnected;

  return (
    <header className="flex items-center justify-between px-6 h-14 shrink-0 bg-obsidian-panel/95 backdrop-blur-2xl border-b border-obsidian-border z-30 select-none">
      {/* ── Brand & Campus Entity ───────────────────────────────────── */}
      <div className="flex items-center gap-3.5">
        <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-black text-base shadow-amber-glow">
          ⚡
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-extrabold tracking-wider text-slate-100 font-sans">
              FLEET COMMAND
            </h1>
            <span className="text-[10px] font-mono font-bold tracking-widest text-amber-400 bg-amber-400/10 border border-amber-400/25 px-1.5 py-0.2 rounded">
              v2.5
            </span>
          </div>
          <p className="text-[10px] text-slate-400 tracking-wider font-medium flex items-center gap-1.5">
            <span>GITAM University</span>
            <span>•</span>
            <span className="text-amber-400/90">KRC Transit Zone</span>
          </p>
        </div>
      </div>

      {/* ── Center: Target Geofence Badge ────────────────────────────── */}
      <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full glass-panel border border-slate-700/50 text-xs">
        <span className="text-amber-400">🏛️</span>
        <span className="text-slate-300 font-medium">Knowledge Resource Centre Anchor:</span>
        <span className="font-mono text-amber-400 font-semibold">17.782167, 83.377472 (100m)</span>
      </div>

      {/* ── Right Cluster: Live Clock, Active Units, Manage Fleet, Status Pill ────── */}
      <div className="flex items-center gap-3">
        {/* Real-time Clock */}
        <div className="hidden sm:flex flex-col text-right pr-1">
          <span className="font-mono text-xs font-bold text-slate-200 tabular-nums">
            {currentTime.toLocaleTimeString([], { hour12: false })}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            IST (UTC+5:30)
          </span>
        </div>

        {/* Active Transponders Metric */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs">
          <span className="text-slate-400 uppercase text-[10px] font-semibold tracking-wide">Fleet:</span>
          <AnimatedCounter
            value={vehicleCount}
            className="text-amber-400 font-bold text-sm"
          />
          <span className="text-slate-500 text-[10px]">active</span>
        </div>

        {/* Download Driver App APK */}
        <a
          href="/FleetTracker-v2.5.apk"
          download="FleetTracker-v2.5.apk"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400/10 border border-amber-400/40 text-amber-400 hover:bg-amber-400/20 hover:border-amber-400/70 transition-all font-semibold text-xs shadow-amber-glow/20 active:scale-95"
          title="Download Android Driver Tracker APK (v2.5)"
        >
          <span>📱</span>
          <span>Download App</span>
        </a>

        {/* Manage Fleet Primary Action Button */}
        <button
          onClick={onOpenFleetManager}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-neon/10 border border-cyan-neon/40 text-cyan-neon hover:bg-cyan-neon/20 hover:border-cyan-neon/70 transition-all font-semibold text-xs shadow-cyan-glow/20 active:scale-95"
          title="Open Vehicle & Driver Asset Management"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-neon" />
          <span>Manage Fleet</span>
        </button>

        {/* Live Connectivity Pill */}
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-mono font-bold ${currentStatus.pill}`}>
          <span className={`w-2 h-2 rounded-full ${currentStatus.dot} ${currentStatus.ring}`} />
          <span className="tracking-wide text-[11px]">{currentStatus.text}</span>
        </div>
      </div>
    </header>
  );
}
