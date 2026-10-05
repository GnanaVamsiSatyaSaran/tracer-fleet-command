import { useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, FastForward, ChevronLeft, ChevronRight, X, Calendar, Bus } from 'lucide-react';

export default function ReplayBar({
  isOpen,
  onClose,
  vehicles = [],
  selectedBusId,
  onSelectBus,
  points = [],
  currentIndex = 0,
  onSeek,
  isPlaying,
  onTogglePlay,
  playbackSpeed,
  onChangeSpeed,
  isLoading,
  selectedDate,
  onChangeDate,
}) {
  const progressPercent = points.length > 1 ? (currentIndex / (points.length - 1)) * 100 : 0;
  const currentPoint = points[currentIndex] || null;

  // Format timestamp for display
  const formatTime = (isoString) => {
    if (!isoString) return '--:--:--';
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const speedOptions = [0.5, 1, 2, 5, 10];

  if (!isOpen) return null;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[500] w-[95%] max-w-4xl bg-obsidian-panel/95 backdrop-blur-2xl border border-cyan-neon/30 rounded-2xl shadow-glass p-4 transition-all animate-in fade-in slide-in-from-bottom-4">
      {/* ── Top Bar: Header & Vehicle / Date Selection ─────────────── */}
      <div className="flex items-center justify-between pb-3 border-b border-obsidian-border text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-neon/10 border border-cyan-neon/30 text-cyan-neon font-mono font-bold tracking-wider uppercase text-[11px]">
            <span className="w-2 h-2 rounded-full bg-cyan-neon animate-pulse" />
            <span>HISTORICAL ROUTE REPLAY</span>
          </div>

          {/* Vehicle Selector */}
          <div className="flex items-center gap-2 bg-obsidian-subtle px-3 py-1 rounded-lg border border-obsidian-border">
            <Bus className="w-3.5 h-3.5 text-amber-electric" />
            <span className="text-slate-400 font-medium">Bus:</span>
            <select
              value={selectedBusId || ''}
              onChange={(e) => onSelectBus(e.target.value)}
              className="bg-transparent text-amber-electric font-mono font-bold outline-none cursor-pointer"
            >
              {vehicles.map((v) => (
                <option key={v.assetId} value={v.assetId} className="bg-obsidian-panel text-slate-100">
                  {v.assetId} ({v.driver?.name || 'Driver'})
                </option>
              ))}
            </select>
          </div>

          {/* Date Picker */}
          <div className="flex items-center gap-2 bg-obsidian-subtle px-3 py-1 rounded-lg border border-obsidian-border">
            <Calendar className="w-3.5 h-3.5 text-cyan-neon" />
            <input
              type="date"
              value={selectedDate || new Date().toISOString().slice(0, 10)}
              onChange={(e) => onChangeDate(e.target.value)}
              className="bg-transparent text-slate-200 font-mono text-[11px] outline-none cursor-pointer"
            />
          </div>
        </div>

        {/* Telemetry Summary Stats & Close Button */}
        <div className="flex items-center gap-4">
          {currentPoint && (
            <div className="hidden sm:flex items-center gap-3 text-[11px] font-mono">
              <div>
                <span className="text-slate-500">SPEED: </span>
                <span className="text-amber-electric font-bold">{currentPoint.speed.toFixed(0)} km/h</span>
              </div>
              <span className="text-slate-600">•</span>
              <div>
                <span className="text-slate-500">BEARING: </span>
                <span className="text-cyan-neon font-bold">{currentPoint.heading}°</span>
              </div>
              <span className="text-slate-600">•</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                currentPoint.inside_geofence
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
              }`}>
                {currentPoint.inside_geofence ? 'IN GEOFENCE' : 'TRANSIT CORRIDOR'}
              </span>
            </div>
          )}

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-obsidian-hover transition-colors"
            title="Exit Replay Mode"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Center: Interactive Scrubber Slider ────────────────────── */}
      <div className="py-3">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1.5">
          <span>{currentPoint ? formatTime(currentPoint.recorded_at) : '08:00:00 AM'}</span>
          <span className="text-cyan-neon font-semibold">
            {isLoading ? 'Loading route data...' : `Waypoint ${currentIndex + 1} of ${Math.max(1, points.length)}`}
          </span>
          <span>{points.length > 0 ? formatTime(points[points.length - 1].recorded_at) : '05:00:00 PM'}</span>
        </div>

        {/* Slider Track */}
        <div className="relative flex items-center group">
          <input
            type="range"
            min="0"
            max={Math.max(0, points.length - 1)}
            value={currentIndex}
            disabled={isLoading || points.length === 0}
            onChange={(e) => onSeek(parseInt(e.target.value, 10))}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-slate-800 accent-cyan-neon focus:outline-none"
            style={{
              background: `linear-gradient(to right, #00F0FF ${progressPercent}%, #273549 ${progressPercent}%)`,
            }}
          />
        </div>
      </div>

      {/* ── Bottom Controls: Play/Pause, Step, Speed Multipliers ──── */}
      <div className="flex items-center justify-between pt-1">
        {/* Playback Controls */}
        <div className="flex items-center gap-2">
          {/* Step Back */}
          <button
            onClick={() => onSeek(Math.max(0, currentIndex - 1))}
            disabled={isLoading || currentIndex <= 0}
            className="p-2 rounded-xl bg-obsidian-subtle border border-obsidian-border text-slate-300 hover:text-cyan-neon hover:border-cyan-neon/40 disabled:opacity-40 transition-all active:scale-95"
            title="Previous Waypoint"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Play / Pause Primary Button */}
          <button
            onClick={onTogglePlay}
            disabled={isLoading || points.length === 0}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-neon to-cyan-500 text-obsidian-bg font-extrabold text-xs shadow-cyan-glow hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
            title={isPlaying ? 'Pause Replay' : 'Play Replay'}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-obsidian-bg" />
                <span>PAUSE</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-obsidian-bg" />
                <span>PLAY REPLAY</span>
              </>
            )}
          </button>

          {/* Step Forward */}
          <button
            onClick={() => onSeek(Math.min(points.length - 1, currentIndex + 1))}
            disabled={isLoading || currentIndex >= points.length - 1}
            className="p-2 rounded-xl bg-obsidian-subtle border border-obsidian-border text-slate-300 hover:text-cyan-neon hover:border-cyan-neon/40 disabled:opacity-40 transition-all active:scale-95"
            title="Next Waypoint"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Reset to Start */}
          <button
            onClick={() => onSeek(0)}
            disabled={isLoading || points.length === 0}
            className="p-2 rounded-xl bg-obsidian-subtle border border-obsidian-border text-slate-400 hover:text-slate-200 transition-colors"
            title="Rewind to Beginning"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Speed Multipliers */}
        <div className="flex items-center gap-1.5 bg-obsidian-subtle p-1 rounded-xl border border-obsidian-border">
          <span className="text-[10px] text-slate-500 font-mono px-2 uppercase font-semibold">Speed:</span>
          {speedOptions.map((speed) => (
            <button
              key={speed}
              onClick={() => onChangeSpeed(speed)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                playbackSpeed === speed
                  ? 'bg-cyan-neon text-obsidian-bg shadow-cyan-glow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-obsidian-panel'
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
