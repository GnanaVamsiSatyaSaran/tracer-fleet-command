package com.tracer.fleettracker.service

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.location.Location
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.tracer.fleettracker.R
import com.tracer.fleettracker.data.local.AppDatabase
import com.tracer.fleettracker.data.local.TelemetryEntity
import com.tracer.fleettracker.data.remote.TelemetryUploader
import com.tracer.fleettracker.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/**
 * Fleet Tracker v3.0 Core Foreground Location Service.
 * - FusedLocationProviderClient with PRIORITY_HIGH_ACCURACY (5000ms polling).
 * - Kinetic Deadband Filter (forces speeds < 1.0 m/s to exactly 0.0 km/h).
 * - Strict 4-State DFSM (STANDBY, BOARDING_OPERATIONS, OUTBOUND_TRANSIT, CAMPUS_LAYOVER).
 * - 15-Minute Boarding Fix: Idle timeouts explicitly suppressed during boarding.
 * - Store-and-Forward SQLite Room Database & Anti-Spoofing Hardware Validation.
 */
class LocationService : Service() {

    enum class OperationalState(val label: String, val badgeColor: Int) {
        STANDBY("AWAITING VEHICLE ASSIGNMENT", R.color.status_standby),
        BOARDING_OPERATIONS("STUDENT BOARDING: TIMEOUT SUPPRESSED", R.color.status_boarding),
        OUTBOUND_TRANSIT("ACTIVE: OUTBOUND TRANSIT", R.color.status_transit),
        CAMPUS_LAYOVER("LAYOVER: TRACKING SUSPENDED", R.color.status_layover)
    }

    companion object {
        private const val TAG = "LocationService"
        const val NOTIFICATION_CHANNEL_ID = "fleet_tracker_channel"
        const val NOTIFICATION_ID = 1001

        const val ACTION_START = "ACTION_START_SHIFT"
        const val ACTION_STOP = "ACTION_STOP_SHIFT"
        const val ACTION_SET_STATE = "ACTION_SET_STATE"

        const val EXTRA_ASSET_ID = "EXTRA_ASSET_ID"
        const val EXTRA_SERVER_URL = "EXTRA_SERVER_URL"
        const val EXTRA_TARGET_STATE = "EXTRA_TARGET_STATE"

        // Observable Live Telemetry State for UI Binding
        data class ServiceState(
            val isTracking: Boolean = false,
            val operationalState: OperationalState = OperationalState.STANDBY,
            val assetId: String = "GITAM-BUS-01",
            val latitude: Double = 0.0,
            val longitude: Double = 0.0,
            val speedKmh: Double = 0.0,
            val heading: Double = 0.0,
            val accuracy: Float = 0.0f,
            val lastUpdated: Long = 0L,
            val spoofDetectedCount: Int = 0,
            val unsyncedCount: Int = 0,
            val boardingStartTime: Long = 0L
        )

        private val _serviceState = MutableStateFlow(ServiceState())
        val serviceState: StateFlow<ServiceState> = _serviceState.asStateFlow()
    }

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private lateinit var database: AppDatabase
    private lateinit var uploader: TelemetryUploader
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var connectivityManager: ConnectivityManager
    private var locationCallback: LocationCallback? = null
    private var wakeLock: PowerManager.WakeLock? = null

    private var activeAssetId: String = "GITAM-BUS-01"
    private var serverEndpoint: String = TelemetryUploader.DEFAULT_SERVER_URL
    private var activeSessionId: String = UUID.randomUUID().toString()
    private var spoofRejections: Int = 0

    private val isoDateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    override fun onCreate() {
        super.onCreate()
        database = AppDatabase.getInstance(applicationContext)
        uploader = TelemetryUploader(applicationContext)
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

        createNotificationChannel()
        acquireWakeLock()
        registerNetworkCallback()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                activeAssetId = intent.getStringExtra(EXTRA_ASSET_ID) ?: "GITAM-BUS-01"
                serverEndpoint = intent.getStringExtra(EXTRA_SERVER_URL) ?: TelemetryUploader.DEFAULT_SERVER_URL
                activeSessionId = UUID.randomUUID().toString()
                startTracking()
            }
            ACTION_STOP -> {
                stopTracking()
            }
            ACTION_SET_STATE -> {
                val stateName = intent.getStringExtra(EXTRA_TARGET_STATE)
                if (stateName != null) {
                    try {
                        val targetState = OperationalState.valueOf(stateName)
                        setOperationalState(targetState)
                    } catch (e: Exception) {
                        Log.w(TAG, "Unknown state transition: $stateName")
                    }
                }
            }
        }
        return START_STICKY
    }

    @SuppressLint("MissingPermission")
    private fun startTracking() {
        startForeground(NOTIFICATION_ID, buildNotification("Active: Outbound Transit • $activeAssetId"))

        _serviceState.value = _serviceState.value.copy(
            isTracking = true,
            operationalState = OperationalState.OUTBOUND_TRANSIT,
            assetId = activeAssetId
        )

        // FusedLocationProviderClient with PRIORITY_HIGH_ACCURACY (5000ms polling)
        val locationRequest = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000L)
            .setMinUpdateIntervalMillis(2000L)
            .setMinUpdateDistanceMeters(1.0f)
            .setWaitForAccurateLocation(false)
            .build()

        locationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                val location = locationResult.lastLocation ?: return
                handleNewLocation(location)
            }
        }

        try {
            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                locationCallback!!,
                Looper.getMainLooper()
            )
            Log.i(TAG, "FusedLocationProviderClient registered at 5000ms interval for $activeAssetId")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register FusedLocationProviderClient: ${e.localizedMessage}")
        }

        // Observe pending SQLite Room backlog count
        serviceScope.launch {
            database.telemetryDao().observeUnsyncedCount().collect { count ->
                _serviceState.value = _serviceState.value.copy(unsyncedCount = count)
            }
        }
    }

    fun setOperationalState(newState: OperationalState) {
        val boardingStart = if (newState == OperationalState.BOARDING_OPERATIONS) {
            System.currentTimeMillis()
        } else {
            0L
        }

        _serviceState.value = _serviceState.value.copy(
            operationalState = newState,
            boardingStartTime = boardingStart
        )

        val notificationMsg = when (newState) {
            OperationalState.STANDBY -> "Transponder Standby • $activeAssetId"
            OperationalState.BOARDING_OPERATIONS -> "Student Boarding (Timeout Suppressed) • $activeAssetId"
            OperationalState.OUTBOUND_TRANSIT -> "Active: Outbound Transit • $activeAssetId"
            OperationalState.CAMPUS_LAYOVER -> "Layover: Tracking Suspended (Privacy Mode)"
        }

        val manager = getSystemService(NotificationManager::class.java)
        manager?.notify(NOTIFICATION_ID, buildNotification(notificationMsg))
        Log.i(TAG, "DFSM State Transitioned to: ${newState.name}")
    }

    private fun stopTracking() {
        locationCallback?.let {
            fusedLocationClient.removeLocationUpdates(it)
        }
        locationCallback = null

        _serviceState.value = _serviceState.value.copy(
            isTracking = false,
            operationalState = OperationalState.STANDBY
        )
        releaseWakeLock()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    // ── Anti-Spoofing GNSS Hardware Validation ─────────────────────────────
    /**
     * Checks if a GPS coordinate is generated by a mock location provider.
     * Android 12+ (API 31+): location.isMock
     * Android 11 and below: location.isFromMockProvider
     */
    private fun isLocationSpoofed(location: Location): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            location.isMock
        } else {
            @Suppress("DEPRECATION")
            location.isFromMockProvider
        }
    }

    private fun handleNewLocation(location: Location) {
        // Strict Anti-Spoofing Hardware Security Validation
        if (isLocationSpoofed(location)) {
            spoofRejections++
            Log.w(TAG, "SECURITY ALERT: Rejected fake GPS coordinate from mock provider! Total blocked: $spoofRejections")
            _serviceState.value = _serviceState.value.copy(spoofDetectedCount = spoofRejections)
            return
        }

        // ── Kinetic Deadband Filter (GPS Drift "Phantom Speed" Fix) ────────
        // If speed < 1.0 m/s (~3.6 km/h), forcefully override to exactly 0.0 km/h
        val rawSpeedMps = if (location.hasSpeed()) location.speed else 0.0f
        val calculatedSpeedKmh = rawSpeedMps * 3.6
        val filteredSpeedKmh = if (rawSpeedMps < 1.0f || calculatedSpeedKmh < 3.6) {
            0.0
        } else {
            calculatedSpeedKmh
        }

        // ── DFSM Automatic Transition: BOARDING -> OUTBOUND_TRANSIT ────────
        // If bus is in BOARDING_OPERATIONS and speed exceeds 15.0 km/h, auto-transition to OUTBOUND_TRANSIT
        if (_serviceState.value.operationalState == OperationalState.BOARDING_OPERATIONS) {
            if (filteredSpeedKmh >= 15.0) {
                Log.i(TAG, "Kinetic speed threshold exceeded (${filteredSpeedKmh} km/h >= 15.0)! Auto-transitioning to OUTBOUND_TRANSIT")
                setOperationalState(OperationalState.OUTBOUND_TRANSIT)
            }
        }

        val headingDeg = if (location.hasBearing()) location.bearing.toDouble() else 0.0
        val altitudeMeters = if (location.hasAltitude()) location.altitude else null
        val batteryPct = getBatteryPercentage()
        val timestampIso = isoDateFormat.format(Date(location.time))

        // Update In-Memory Reactive State
        _serviceState.value = _serviceState.value.copy(
            latitude = location.latitude,
            longitude = location.longitude,
            speedKmh = filteredSpeedKmh,
            heading = headingDeg,
            accuracy = location.accuracy,
            lastUpdated = System.currentTimeMillis()
        )

        // Privacy Lock: In CAMPUS_LAYOVER state, GPS streaming and logging are suspended!
        if (_serviceState.value.operationalState == OperationalState.CAMPUS_LAYOVER) {
            updateNotification(0.0, location.latitude, location.longitude, "⏸️ Layover Mode: Tracking Suspended (Privacy Mode)")
            return
        }

        val stateLabel = when (_serviceState.value.operationalState) {
            OperationalState.BOARDING_OPERATIONS -> "Boarding (Idle Timeout Suppressed)"
            OperationalState.OUTBOUND_TRANSIT -> "Speed: ${String.format(Locale.US, "%.1f", filteredSpeedKmh)} km/h"
            else -> "Tracking"
        }
        updateNotification(filteredSpeedKmh, location.latitude, location.longitude, stateLabel)

        // Store-and-Forward: Save to Room SQLite, then trigger upload attempt
        serviceScope.launch {
            val entity = TelemetryEntity(
                assetId = activeAssetId,
                latitude = location.latitude,
                longitude = location.longitude,
                altitude = altitudeMeters,
                speed = filteredSpeedKmh,
                heading = headingDeg,
                batteryLevel = batteryPct,
                recordedAt = timestampIso,
                sessionId = activeSessionId,
                synced = false
            )

            // 1. Persist to local Room SQLite cache
            val insertedId = database.telemetryDao().insert(entity)
            val persistedEntity = entity.copy(id = insertedId)

            // 2. Direct upload attempt via HTTP POST to cloud backend
            val isSuccess = uploader.uploadBatch(serverEndpoint, listOf(persistedEntity))
            if (isSuccess) {
                database.telemetryDao().markAsSynced(listOf(insertedId))
                database.telemetryDao().purgeSyncedRecords()
            } else {
                Log.d(TAG, "Network offline; coordinate queued in Room (ID: $insertedId)")
            }
        }
    }

    // ── 4G Cellular Reconnection Flush Callback ───────────────────────────
    private fun registerNetworkCallback() {
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()

        connectivityManager.registerNetworkCallback(request, object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                Log.i(TAG, "Cellular / WiFi restored. Triggering offline Room queue flush...")
                serviceScope.launch {
                    val flushed = uploader.flushOfflineQueue(database.telemetryDao(), serverEndpoint)
                    if (flushed > 0) {
                        Log.i(TAG, "Flushed $flushed backlogged telemetry records to server.")
                    }
                }
            }
        })
    }

    private fun getBatteryPercentage(): Int? {
        val batteryStatus: Intent? = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        return batteryStatus?.let { intent ->
            val level: Int = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale: Int = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
            if (level >= 0 && scale > 0) ((level / scale.toFloat()) * 100).toInt() else null
        }
    }

    @SuppressLint("WakelockTimeout")
    private fun acquireWakeLock() {
        if (wakeLock == null) {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "FleetTracker::LocationWakeLock"
            ).apply {
                acquire()
            }
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) it.release()
        }
        wakeLock = null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Fleet Tracker Active Shift",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Persistent lock-screen notification during active bus transit tracking"
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setShowBadge(true)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(statusText: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("Fleet Command • $activeAssetId")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(pendingIntent)
            .build()
    }

    private fun updateNotification(speedKmh: Double, lat: Double, lng: Double, statusPrefix: String) {
        val formattedSpeed = String.format(Locale.US, "%.1f km/h", speedKmh)
        val text = "$statusPrefix | Lat: ${String.format(Locale.US, "%.5f", lat)}, Lon: ${String.format(Locale.US, "%.5f", lng)}"
        val manager = getSystemService(NotificationManager::class.java)
        manager?.notify(NOTIFICATION_ID, buildNotification(text))
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
        releaseWakeLock()
    }
}
