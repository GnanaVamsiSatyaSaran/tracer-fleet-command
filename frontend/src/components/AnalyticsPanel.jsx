import React, { useState } from 'react';

export default function AnalyticsPanel({ vehicles, analyticsLogs, stats }) {
  const [activeTab, setActiveTab] = useState('ANALYTICS'); // 'ANALYTICS' | 'ROSTER'

  // Format seconds into human readable duration
  function formatDuration(totalSeconds) {
    if (!totalSeconds || totalSeconds <= 0) return 'Just entered';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  // Export Analytics logs to downloadable CSV file (Requirement)
  function handleExportCSV() {
    if (analyticsLogs.length === 0) {
      alert('No campus transit events logged yet today.');
      return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Asset ID,Operator,Event Type,Entry Time,Exit Time,Campus Duration (Seconds),Speed (km/h),Logged At\r\n';

    analyticsLogs.forEach((row) => {
      const entryStr = row.entryTime ? new Date(row.entryTime).toLocaleTimeString() : 'N/A';
      const exitStr = row.exitTime ? new Date(row.exitTime).toLocaleTimeString() : 'Currently on Campus';
      const duration = row.durationSeconds || 0;

      csvContent += `"${row.assetId}","${row.driverName}","${row.eventType}","${entryStr}","${exitStr}","${duration}","${row.speed}","${new Date(row.timestamp).toLocaleTimeString()}"\r\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Fleet_Campus_Analytics_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <aside className="w-96 bg-surface-ground border-l border-slate-200/90 flex flex-col h-full shadow-lg z-10">
      {/* Panel Navigation & Export Action */}
      <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between">
        <div className="flex gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('ANALYTICS')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'ANALYTICS'
                ? 'bg-navy-900 text-gold-300 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Campus Dwell Log
          </button>
          <button
            onClick={() => setActiveTab('ROSTER')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'ROSTER'
                ? 'bg-navy-900 text-gold-300 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Active Fleet ({vehicles.length})
          </button>
        </div>

        {/* Export to CSV Button */}
        <button
          onClick={handleExportCSV}
          title="Download campus dwell times and entry/exit logs"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-gold-500 to-amber-500 hover:from-gold-600 hover:to-amber-600 text-navy-900 text-xs font-bold font-mono rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span>Export CSV</span>
        </button>
      </div>

      {/* Summary Stat Cards */}
      <div className="p-4 grid grid-cols-2 gap-3 bg-white border-b border-slate-200/80">
        <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-2xl">
          <div className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
            CAMPUS ENTRIES TODAY
          </div>
          <div className="text-xl font-bold font-mono text-navy-900 mt-1">
            {analyticsLogs.filter((l) => l.eventType === 'CAMPUS_ENTRY').length}
          </div>
          <div className="text-[10px] text-emerald-600 font-medium mt-0.5">
            Geofenced 100m Dwellings
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-2xl">
          <div className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
            FLEET SIGNAL HEALTH
          </div>
          <div className="text-xl font-bold font-mono text-navy-900 mt-1">
            {stats.totalCount > 0 ? `${Math.round(((stats.totalCount - stats.staleCount) / stats.totalCount) * 100)}%` : '100%'}
          </div>
          <div className={`text-[10px] font-medium mt-0.5 ${stats.staleCount > 0 ? 'text-amber-600' : 'text-slate-500'}`}>
            {stats.staleCount > 0 ? `${stats.staleCount} in Dead Reckoning` : 'All signals nominal'}
          </div>
        </div>
      </div>

      {/* Tab 1: Campus Entry/Exit Logs */}
      {activeTab === 'ANALYTICS' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold px-1">
            <span>DWELL & TRANSIT EVENTS</span>
            <span className="font-mono text-[11px]">{analyticsLogs.length} Records</span>
          </div>

          {analyticsLogs.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center">
              <div className="w-10 h-10 rounded-full bg-gold-100 text-gold-600 mx-auto flex items-center justify-center mb-2">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <p className="text-xs font-medium text-slate-600">Waiting for Geofence Events</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Buses crossing within 100m of the campus geofence will generate entry/exit records automatically.
              </p>
            </div>
          ) : (
            analyticsLogs.map((log) => {
              const isEntry = log.eventType === 'CAMPUS_ENTRY';
              return (
                <div
                  key={log.id}
                  className={`bg-white border rounded-2xl p-3.5 shadow-card transition-all ${
                    isEntry ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-navy-900 text-sm font-sans">{log.assetId}</span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                        isEntry
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {isEntry ? 'ARRIVED ON CAMPUS' : 'DEPARTED CAMPUS'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-600 mb-2">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">ENTRY TIME</span>
                      <span className="font-semibold text-slate-800">
                        {log.entryTime ? new Date(log.entryTime).toLocaleTimeString() : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">EXIT TIME</span>
                      <span className="font-semibold text-slate-800">
                        {log.exitTime ? new Date(log.exitTime).toLocaleTimeString() : 'Active on Campus'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
                    <span className="text-slate-400 font-sans">Campus Duration:</span>
                    <span className="font-bold font-mono text-gold-600 bg-gold-50 px-2 py-0.5 rounded border border-gold-200">
                      {formatDuration(log.durationSeconds)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab 2: Real-Time Fleet Roster */}
      {activeTab === 'ROSTER' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="text-xs text-slate-500 font-semibold px-1">
            MONITORED VEHICLE ASSETS ({vehicles.length})
          </div>

          {vehicles.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center text-slate-400 text-xs">
              No live telemetry received yet. Awaiting backend WebSocket stream.
            </div>
          ) : (
            vehicles.map((v) => (
              <div
                key={v.assetId}
                className={`bg-white border rounded-2xl p-3.5 shadow-card ${
                  v.isStale
                    ? 'border-amber-300 bg-amber-50/30 opacity-75'
                    : v.insideGeofence
                    ? 'border-emerald-300 bg-emerald-50/20'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-navy-900 text-sm">{v.assetId}</span>
                    {v.isStale && (
                      <span className="bg-amber-100 text-amber-800 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded animate-pulse">
                        DEAD RECKONING
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                      v.insideGeofence ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {v.insideGeofence ? 'ON CAMPUS' : 'IN TRANSIT'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs font-mono text-slate-600">
                  <span>Speed: <strong className="text-navy-900">{v.speed.toFixed(1)} km/h</strong></span>
                  <span>Battery: <strong className={v.batteryLevel < 20 ? 'text-red-600' : 'text-emerald-600'}>{v.batteryLevel}%</strong></span>
                </div>

                <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400 font-mono flex items-center justify-between">
                  <span>Coordinates: {v.latitude.toFixed(4)}, {v.longitude.toFixed(4)}</span>
                  <span>Last Seen: {Math.round((Date.now() - v.lastSeen) / 1000)}s ago</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </aside>
  );
}
