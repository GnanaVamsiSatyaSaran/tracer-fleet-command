import { Shield, Trash2, X, Plus } from 'lucide-react';

export default function GeofenceManagerModal({
  isOpen,
  onClose,
  geofences = [],
  onDeleteGeofence,
  onTriggerDraw,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-lg bg-obsidian-panel border border-cyan-neon/40 rounded-2xl p-6 shadow-glass animate-in zoom-in-95">
        <div className="flex items-center justify-between pb-4 border-b border-obsidian-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-neon/10 border border-cyan-neon/30 text-cyan-neon">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Dynamic Geofence Zones</h3>
              <p className="text-[11px] text-slate-400">PostGIS Multi-Polygon Spatial Directory</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-obsidian-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Zones List */}
        <div className="mt-4 max-h-72 overflow-y-auto space-y-2 pr-1">
          {geofences.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              No dynamic geofences registered yet. Click &quot;Draw New Zone&quot; to begin.
            </div>
          ) : (
            geofences.map((zone) => (
              <div
                key={zone.id}
                className="flex items-center justify-between p-3 rounded-xl bg-obsidian-subtle border border-obsidian-border hover:border-cyan-neon/30 transition-all"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0 shadow-sm"
                    style={{ backgroundColor: zone.color || '#00F0FF' }}
                  />
                  <div>
                    <h4 className="text-xs font-bold text-slate-200">{zone.name}</h4>
                    <p className="text-[10px] text-slate-500 font-mono">
                      {zone.type === 'circle'
                        ? `Circle • ${zone.radius_meters || 100}m Radius`
                        : `Polygon • ${zone.coordinates?.length || 0} Points`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {zone.id !== 'krc-hub-default' && (
                    <button
                      onClick={() => onDeleteGeofence(zone.id)}
                      className="p-1.5 rounded-lg text-rose-400/80 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Delete Geofence"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  {zone.id === 'krc-hub-default' && (
                    <span className="text-[10px] font-mono text-amber-electric/80 bg-amber-electric/10 border border-amber-electric/20 px-2 py-0.5 rounded">
                      CORE ANCHOR
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 mt-4 border-t border-obsidian-border">
          <span className="text-[11px] font-mono text-slate-400">
            Total Zones: <b className="text-cyan-neon">{geofences.length}</b>
          </span>
          <button
            onClick={() => {
              onClose();
              if (onTriggerDraw) onTriggerDraw();
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-neon/10 border border-cyan-neon/40 text-cyan-neon hover:bg-cyan-neon/20 font-bold text-xs transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Draw New Zone</span>
          </button>
        </div>
      </div>
    </div>
  );
}
