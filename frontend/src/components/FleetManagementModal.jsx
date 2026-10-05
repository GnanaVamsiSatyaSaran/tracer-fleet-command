import { useState, useEffect, useCallback } from 'react';
import { Bus, Users, Plus, Trash2, X, CheckCircle, AlertCircle, Phone, CreditCard, Hash, ShieldCheck } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function FleetManagementModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('vehicles'); // 'vehicles' | 'drivers'
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // Vehicle form state
  const [vehicleForm, setVehicleForm] = useState({
    asset_tag: '',
    license_plate: '',
    model: '',
    capacity: 40,
    status: 'ACTIVE',
  });

  // Driver form state
  const [driverForm, setDriverForm] = useState({
    employee_id: '',
    full_name: '',
    role: 'DRIVER',
    phone_number: '',
    license_number: '',
  });

  const showNotification = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Fetch Data ────────────────────────────────────────────────────────
  const fetchVehicles = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE}/api/assets`);
      if (res.ok) {
        const data = await res.json();
        setVehicles(data.assets || []);
      }
    } catch (err) {
      console.warn('[FleetManager] Failed to fetch assets:', err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchDrivers = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE}/api/personnel`);
      if (res.ok) {
        const data = await res.json();
        setDrivers(data.personnel || []);
      }
    } catch (err) {
      console.warn('[FleetManager] Failed to fetch personnel:', err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchVehicles();
      fetchDrivers();
    }
  }, [isOpen, fetchVehicles, fetchDrivers]);

  // ── Vehicle Actions ───────────────────────────────────────────────────
  const handleRegisterVehicle = async (e) => {
    e.preventDefault();
    if (!vehicleForm.asset_tag.trim() || !vehicleForm.license_plate.trim() || !vehicleForm.model.trim()) {
      showNotification('Please fill in all required vehicle fields', 'error');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vehicleForm),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(`Vehicle ${data.asset?.asset_tag || vehicleForm.asset_tag} registered successfully!`);
        setVehicleForm({
          asset_tag: '',
          license_plate: '',
          model: '',
          capacity: 40,
          status: 'ACTIVE',
        });
        fetchVehicles();
      } else {
        showNotification(data.error || 'Failed to register vehicle', 'error');
      }
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  const handleDeleteVehicle = async (id, tag) => {
    try {
      const res = await fetch(`${API_BASE}/api/assets/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification(`Vehicle ${tag} decommissioned`);
        setVehicles(prev => prev.filter(v => v.id !== id && v.asset_tag !== tag));
      } else {
        showNotification('Failed to remove vehicle', 'error');
      }
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  // ── Driver Actions ────────────────────────────────────────────────────
  const handleRegisterDriver = async (e) => {
    e.preventDefault();
    if (!driverForm.employee_id.trim() || !driverForm.full_name.trim()) {
      showNotification('Employee ID and Full Name are required', 'error');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/personnel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(driverForm),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(`Driver ${data.personnel?.full_name || driverForm.full_name} enrolled successfully!`);
        setDriverForm({
          employee_id: '',
          full_name: '',
          role: 'DRIVER',
          phone_number: '',
          license_number: '',
        });
        fetchDrivers();
      } else {
        showNotification(data.error || 'Failed to register driver', 'error');
      }
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  const handleDeleteDriver = async (id, name) => {
    try {
      const res = await fetch(`${API_BASE}/api/personnel/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification(`Driver ${name} removed`);
        setDrivers(prev => prev.filter(d => d.id !== id && d.employee_id !== id));
      } else {
        showNotification('Failed to remove driver', 'error');
      }
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-obsidian-panel/95 border border-cyan-neon/30 rounded-2xl shadow-glass overflow-hidden animate-in zoom-in-95">
        
        {/* ── Toast Overlay ────────────────────────────────────────────── */}
        {toast && (
          <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold shadow-lg border animate-in slide-in-from-top-2 ${
            toast.type === 'error'
              ? 'bg-rose-950/90 text-rose-300 border-rose-600/50'
              : 'bg-emerald-950/90 text-emerald-300 border-emerald-600/50 shadow-emerald-glow/20'
          }`}>
            {toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
            <span>{toast.message}</span>
          </div>
        )}

        {/* ── Modal Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-obsidian-border bg-obsidian-subtle/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-neon/10 border border-cyan-neon/30 text-cyan-neon shadow-cyan-glow/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-sans">
                Fleet & Personnel Operations
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">
                Cloud Synchronized with PostGIS Asset Registry • {API_BASE.replace(/^https?:\/\//, '')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Tabs Nav */}
            <div className="flex bg-obsidian-panel p-1 rounded-xl border border-obsidian-border">
              <button
                onClick={() => setActiveTab('vehicles')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'vehicles'
                    ? 'bg-cyan-neon text-obsidian-bg shadow-cyan-glow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Bus className="w-3.5 h-3.5" />
                <span>Vehicles ({vehicles.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('drivers')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'drivers'
                    ? 'bg-cyan-neon text-obsidian-bg shadow-cyan-glow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Drivers ({drivers.length})</span>
              </button>
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-obsidian-hover transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Modal Body Content ──────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* ══════════════ TAB 1: VEHICLES ══════════════ */}
          {activeTab === 'vehicles' && (
            <div className="space-y-6">
              
              {/* Register New Vehicle Form Card */}
              <div className="bg-obsidian-subtle/70 border border-obsidian-border rounded-xl p-4">
                <h3 className="text-xs font-bold text-cyan-neon uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  <span>Register New Fleet Asset (POST /api/assets)</span>
                </h3>

                <form onSubmit={handleRegisterVehicle} className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 text-[10px] font-mono uppercase mb-1">
                      Asset Tag *
                    </label>
                    <div className="flex items-center bg-obsidian-panel border border-obsidian-border rounded-lg px-2.5 py-1.5 focus-within:border-cyan-neon">
                      <Hash className="w-3.5 h-3.5 text-amber-electric mr-1.5" />
                      <input
                        type="text"
                        placeholder="e.g. GITAM-BUS-06"
                        value={vehicleForm.asset_tag}
                        onChange={(e) => setVehicleForm({ ...vehicleForm, asset_tag: e.target.value })}
                        className="bg-transparent text-slate-100 font-mono text-xs outline-none w-full"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-400 text-[10px] font-mono uppercase mb-1">
                      License Plate *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. AP 31 TJ 1006"
                      value={vehicleForm.license_plate}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, license_plate: e.target.value })}
                      className="bg-obsidian-panel border border-obsidian-border rounded-lg px-3 py-1.5 text-slate-100 font-mono text-xs outline-none focus:border-cyan-neon w-full"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 text-[10px] font-mono uppercase mb-1">
                      Vehicle Model *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Tata Starbus 40S"
                      value={vehicleForm.model}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                      className="bg-obsidian-panel border border-obsidian-border rounded-lg px-3 py-1.5 text-slate-100 text-xs outline-none focus:border-cyan-neon w-full"
                      required
                    />
                  </div>

                  <div className="flex items-end gap-2">
                    <div className="w-1/2">
                      <label className="block text-slate-400 text-[10px] font-mono uppercase mb-1">
                        Capacity
                      </label>
                      <input
                        type="number"
                        min="10"
                        max="100"
                        value={vehicleForm.capacity}
                        onChange={(e) => setVehicleForm({ ...vehicleForm, capacity: parseInt(e.target.value, 10) || 40 })}
                        className="bg-obsidian-panel border border-obsidian-border rounded-lg px-3 py-1.5 text-slate-100 font-mono text-xs outline-none focus:border-cyan-neon w-full"
                      />
                    </div>

                    <button
                      type="submit"
                      className="flex-1 py-1.5 px-3 rounded-lg bg-gradient-to-r from-cyan-neon to-cyan-500 text-obsidian-bg font-bold text-xs shadow-cyan-glow hover:brightness-110 active:scale-95 transition-all"
                    >
                      Enroll Bus
                    </button>
                  </div>
                </form>
              </div>

              {/* Registered Vehicles Directory Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Active Vehicle Inventory ({vehicles.length})
                  </h3>
                  {isLoading && <span className="text-[11px] text-cyan-neon font-mono animate-pulse">Syncing...</span>}
                </div>

                <div className="border border-obsidian-border rounded-xl overflow-hidden bg-obsidian-subtle/40">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-obsidian-panel/80 text-slate-400 font-mono text-[10px] uppercase border-b border-obsidian-border">
                        <th className="py-2.5 px-4">Asset Tag</th>
                        <th className="py-2.5 px-4">Model & Capacity</th>
                        <th className="py-2.5 px-4">License Plate</th>
                        <th className="py-2.5 px-4">Status</th>
                        <th className="py-2.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-obsidian-border/60">
                      {vehicles.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="py-6 text-center text-slate-500 font-mono">
                            No vehicles registered. Use the form above to enroll a bus.
                          </td>
                        </tr>
                      ) : (
                        vehicles.map((v) => (
                          <tr key={v.id || v.asset_tag} className="hover:bg-obsidian-hover/50 transition-colors">
                            <td className="py-3 px-4">
                              <span className="font-mono font-bold text-amber-electric bg-amber-electric/10 border border-amber-electric/30 px-2 py-0.5 rounded text-xs">
                                {v.asset_tag}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-semibold text-slate-200">{v.model}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{v.capacity || 40} Seats</div>
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-300">
                              {v.license_plate}
                            </td>
                            <td className="py-3 px-4">
                              <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                {v.status || 'ACTIVE'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => handleDeleteVehicle(v.id || v.asset_tag, v.asset_tag)}
                                className="p-1.5 rounded-lg text-rose-400 hover:text-white hover:bg-rose-500/20 transition-colors"
                                title="Decommission Vehicle"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════ TAB 2: DRIVERS ══════════════ */}
          {activeTab === 'drivers' && (
            <div className="space-y-6">
              
              {/* Register New Driver Form Card */}
              <div className="bg-obsidian-subtle/70 border border-obsidian-border rounded-xl p-4">
                <h3 className="text-xs font-bold text-cyan-neon uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  <span>Register Certified Driver (POST /api/personnel)</span>
                </h3>

                <form onSubmit={handleRegisterDriver} className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 text-[10px] font-mono uppercase mb-1">
                      Employee ID *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. EMP-9905"
                      value={driverForm.employee_id}
                      onChange={(e) => setDriverForm({ ...driverForm, employee_id: e.target.value })}
                      className="bg-obsidian-panel border border-obsidian-border rounded-lg px-3 py-1.5 text-slate-100 font-mono text-xs outline-none focus:border-cyan-neon w-full"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 text-[10px] font-mono uppercase mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Srinivas Rao"
                      value={driverForm.full_name}
                      onChange={(e) => setDriverForm({ ...driverForm, full_name: e.target.value })}
                      className="bg-obsidian-panel border border-obsidian-border rounded-lg px-3 py-1.5 text-slate-100 text-xs outline-none focus:border-cyan-neon w-full"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 text-[10px] font-mono uppercase mb-1">
                      Phone Number
                    </label>
                    <div className="flex items-center bg-obsidian-panel border border-obsidian-border rounded-lg px-2.5 py-1.5 focus-within:border-cyan-neon">
                      <Phone className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
                      <input
                        type="text"
                        placeholder="+91 98480..."
                        value={driverForm.phone_number}
                        onChange={(e) => setDriverForm({ ...driverForm, phone_number: e.target.value })}
                        className="bg-transparent text-slate-100 font-mono text-xs outline-none w-full"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-400 text-[10px] font-mono uppercase mb-1">
                      License Number
                    </label>
                    <div className="flex items-center bg-obsidian-panel border border-obsidian-border rounded-lg px-2.5 py-1.5 focus-within:border-cyan-neon">
                      <CreditCard className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
                      <input
                        type="text"
                        placeholder="AP31-202..."
                        value={driverForm.license_number}
                        onChange={(e) => setDriverForm({ ...driverForm, license_number: e.target.value })}
                        className="bg-transparent text-slate-100 font-mono text-xs outline-none w-full"
                      />
                    </div>
                  </div>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full py-1.5 px-3 rounded-lg bg-gradient-to-r from-cyan-neon to-cyan-500 text-obsidian-bg font-bold text-xs shadow-cyan-glow hover:brightness-110 active:scale-95 transition-all"
                    >
                      Enroll Driver
                    </button>
                  </div>
                </form>
              </div>

              {/* Registered Personnel Directory Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Transit Staff Directory ({drivers.length})
                  </h3>
                  {isLoading && <span className="text-[11px] text-cyan-neon font-mono animate-pulse">Syncing...</span>}
                </div>

                <div className="border border-obsidian-border rounded-xl overflow-hidden bg-obsidian-subtle/40">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-obsidian-panel/80 text-slate-400 font-mono text-[10px] uppercase border-b border-obsidian-border">
                        <th className="py-2.5 px-4">Employee ID</th>
                        <th className="py-2.5 px-4">Driver Name</th>
                        <th className="py-2.5 px-4">Role</th>
                        <th className="py-2.5 px-4">Contact Phone</th>
                        <th className="py-2.5 px-4">License</th>
                        <th className="py-2.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-obsidian-border/60">
                      {drivers.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="py-6 text-center text-slate-500 font-mono">
                            No drivers registered. Use the form above to enroll transit staff.
                          </td>
                        </tr>
                      ) : (
                        drivers.map((d) => (
                          <tr key={d.id || d.employee_id} className="hover:bg-obsidian-hover/50 transition-colors">
                            <td className="py-3 px-4 font-mono font-bold text-slate-300">
                              {d.employee_id}
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-100">
                              {d.full_name}
                            </td>
                            <td className="py-3 px-4">
                              <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-cyan-neon/10 text-cyan-neon border border-cyan-neon/30">
                                {d.role || 'DRIVER'}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-300">
                              {d.phone_number || '—'}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                              {d.license_number || '—'}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => handleDeleteDriver(d.id || d.employee_id, d.full_name)}
                                className="p-1.5 rounded-lg text-rose-400 hover:text-white hover:bg-rose-500/20 transition-colors"
                                title="Remove Personnel"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
