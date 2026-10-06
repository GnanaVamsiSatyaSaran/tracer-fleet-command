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
 * High-reliability Persistent Location Tracking Foreground Service.
 * Refactored to Google Play Services FusedLocationProviderClient with PRIORITY_HIGH_ACCURACY (5000ms).
 * Provides seamless GNSS -> Wi-Fi/Cellular failover in tunnels and underpasses.
 */
class LocationService : Service() {

    enum class OperationalState(val label: String, val badgeColor: Int) {
        STANDBY("AWAITING VEHICLE ASSIGNMENT", R.color.slate_400),
        INBOUND_TRANSIT("ACTIVE: INBOUND ROUTE", R.color.amber_electric),
        CAMPUS_LAYOVER("LAYOVER: TRACKING SUSPENDED", R.color.cyan_neon)
    }

    companion object {
        private const val TAG = "LocationService"
        const val NOTIFICATION_CHANNEL_ID = "fleet_tracker_channel"
        const val NOTIFICATION_ID = 1001

        const val ACTION_START = "ACTION_START_SHIFT"
        const val ACTION_STOP = "ACTION_STOP_SHIFT"
        const val ACTION_SET_LAYOVER = "ACTION_SET_LAYOVER"
        const val EXTRA_ASSET_ID = "EXTRA_ASSET_ID"
        const val EXTRA_SERVER_URL = "EXTRA_SERVER_URL"
        const val EXTRA_IS_LAYOVER = "EXTRA_IS_LAYOVER"

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
            val unsyncedCount: Int = 0
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
            ACTION_SET_LAYOVER -> {
                val isLayover = intent.getBooleanExtra(EXTRA_IS_LAYOVER, false)
                toggleLayoverMode(isLayover)
            }
        }
        return START_STICKY
    }

    @SuppressLint("MissingPermission")
    private fun startTracking() {
        startForeground(NOTIFICATION_ID, buildNotification("Active: Inbound Route • $activeAssetId"))

        _serviceState.value = _serviceState.value.copy(
            isTracking = true,
            operationalState = OperationalState.INBOUND_TRANSIT,
            assetId = activeAssetId
        )

        // Google Play Services: FusedLocationProviderClient Anti-Degradation Request
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
            Log.i(TAG, "FusedLocationProviderClient polling at 5000ms HIGH_ACCURACY for $activeAssetId")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register FusedLocationProviderClient: ${e.localizedMessage}")
        }

        // Observe pending local SQLite Room cache count
        serviceScope.launch {
            database.telemetryDao().observeUnsyncedCount().collect { count ->
                _serviceState.value = _serviceState.value.copy(unsyncedCount = count)
            }
        }
    }

    private fun toggleLayoverMode(isLayover: Boolean) {
        val newState = if (isLayover) OperationalState.CAMPUS_LAYOVER else OperationalState.INBOUND_TRANSIT
        _serviceState.value = _serviceState.value.copy(operationalState = newState)

        val notificationMsg = if (isLayover) {
            "Campus Layover: Tracking Suspended (Privacy Mode)"
        } else {
            "Active: Inbound Route • $activeAssetId"
        }
        val manager = getSystemService(NotificationManager::class.java)
        manager?.notify(NOTIFICATION_ID, buildNotification(notificationMsg))
        Log.i(TAG, "DFSM Operational state transitioned to: ${newState.name}")
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
        // Strict Anti-Spoofing Security Verification
        if (isLocationSpoofed(location)) {
            spoofRejections++
            Log.w(TAG, "SECURITY ALERT: Rejected fake GPS coordinate from mock provider! Total blocked: $spoofRejections")
            _serviceState.value = _serviceState.value.copy(spoofDetectedCount = spoofRejections)
            return
        }

        val speedKmh = if (location.hasSpeed()) (location.speed * 3.6) else 0.0
        val headingDeg = if (location.hasBearing()) location.bearing.toDouble() else 0.0
        val altitudeMeters = if (location.hasAltitude()) location.altitude else null
        val batteryPct = getBatteryPercentage()
        val timestampIso = isoDateFormat.format(Date(location.time))

        // Update In-Memory Reactive State
        _serviceState.value = _serviceState.value.copy(
            latitude = location.latitude,
            longitude = location.longitude,
            speedKmh = speedKmh,
            heading = headingDeg,
            accuracy = location.accuracy,
            lastUpdated = System.currentTimeMillis()
        )

        // Privacy Lock: In CAMPUS_LAYOVER state, GPS streaming and logging are suspended!
        if (_serviceState.value.operationalState == OperationalState.CAMPUS_LAYOVER) {
            updateNotification(0.0, location.latitude, location.longitude, isLayover = true)
            Log.d(TAG, "Campus layover active; telemetry ingestion deferred for privacy.")
            return
        }

        updateNotification(speedKmh, location.latitude, location.longitude, isLayover = false)

        // Store-and-Forward: Save to Room SQLite, then trigger immediate upload attempt
        serviceScope.launch {
            val entity = TelemetryEntity(
                assetId = activeAssetId,
                latitude = location.latitude,
                longitude = location.longitude,
                altitude = altitudeMeters,
                speed = speedKmh,
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
                Log.d(TAG, "Network unavailable; coordinate queued in Room (ID: $insertedId)")
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

    private fun updateNotification(speedKmh: Double, lat: Double, lng: Double, isLayover: Boolean) {
        val text = if (isLayover) {
            "⏸️ Layover Mode: Tracking Suspended (Privacy Mode)"
        } else {
            val formattedSpeed = String.format(Locale.US, "%.1f km/h", speedKmh)
            "Speed: $formattedSpeed | Lat: ${String.format(Locale.US, "%.5f", lat)}, Lon: ${String.format(Locale.US, "%.5f", lng)}"
        }
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
