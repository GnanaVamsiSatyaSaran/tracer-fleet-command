import { useState } from 'react';
import { Shield, Check, X, Palette } from 'lucide-react';

export default function GeofenceModal({ isOpen, onClose, onSave, coordinates = [] }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#00F0FF');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const colorPresets = [
    { label: 'Neon Cyan', value: '#00F0FF' },
    { label: 'Electric Amber', value: '#FFB800' },
    { label: 'Emerald Green', value: '#10B981' },
    { label: 'Sky Blue', value: '#38BDF8' },
    { label: 'Crimson Red', value: '#F43F5E' },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await onSave({
        name: name.trim(),
        color,
        coordinates,
        type: 'polygon',
      });
      setName('');
      onClose();
    } catch (err) {
      console.error('Error creating geofence:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-md bg-obsidian-panel border border-cyan-neon/40 rounded-2xl p-6 shadow-glass animate-in zoom-in-95">
        <div className="flex items-center justify-between pb-4 border-b border-obsidian-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-neon/10 border border-cyan-neon/30 text-cyan-neon">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Save Dynamic Geofence</h3>
              <p className="text-[11px] text-slate-400">PostGIS Spatial Zone Registration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-obsidian-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Zone Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g., North Academic Gate, Beach Corridor..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-obsidian-subtle border border-obsidian-border text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-neon transition-colors"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-cyan-neon" />
              <span>Boundary Color</span>
            </label>
            <div className="grid grid-cols-5 gap-2">
              {colorPresets.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`h-8 rounded-lg border flex items-center justify-center transition-all ${
                    color === c.value
                      ? 'border-white scale-105 shadow-cyan-glow'
                      : 'border-transparent opacity-75 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                >
                  {color === c.value && <Check className="w-4 h-4 text-obsidian-bg stroke-[3]" />}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-obsidian-subtle p-3 rounded-xl border border-obsidian-border text-[11px] font-mono text-slate-400 flex items-center justify-between">
            <span>Vertices Captured:</span>
            <span className="text-cyan-neon font-bold">{coordinates.length} GPS Coordinates</span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-obsidian-hover transition-colors"
            >
              Discard
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-neon to-cyan-500 text-obsidian-bg font-extrabold text-xs shadow-cyan-glow hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Saving to Database...' : 'Save Geofence'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
