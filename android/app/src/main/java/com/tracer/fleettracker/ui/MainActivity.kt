package com.tracer.fleettracker.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.tracer.fleettracker.R
import com.tracer.fleettracker.data.remote.TelemetryUploader
import com.tracer.fleettracker.databinding.ActivityMainBinding
import com.tracer.fleettracker.service.LocationService
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.util.Locale

/**
 * Fleet Tracker v3.0 Main Driver Console HUD:
 * - Neo-Morphic Enterprise UI Aesthetic (Deep Charcoal & Indigo/Purple)
 * - 4-State DFSM (STANDBY, BOARDING_OPERATIONS, OUTBOUND_TRANSIT, CAMPUS_LAYOVER)
 * - 15-Minute Boarding Mode: Idle timeouts suppressed
 * - Kinetic Deadband Filter: Speeds < 1.0 m/s (~3.6 km/h) clamped to 0.0 km/h
 * - Physical Identity Decoupling with Google ML Kit Vision QR Scanner
 * - Dynamic Cloud Fleet Synchronization (GET /api/assets)
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var isShiftActive = false
    private var boundAssetTag: String? = null
    private var activeDriverName: String = "Captain: Ramesh Kumar (DRV-8821)"
    private var dynamicBusesList = ArrayList<String>()

    private var connectivityManager: ConnectivityManager? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    // Google ML Kit QR Scanner Contract
    private val qrScanLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            val scannedTag = result.data?.getStringExtra(QrScannerActivity.EXTRA_ASSET_TAG)
            if (!scannedTag.isNullOrBlank()) {
                bindVehicleIdentity(scannedTag)
            }
        }
    }

    // Runtime Permission Request Contract (GNSS & Notifications)
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val fineLocationGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] ?: false
        val coarseLocationGranted = permissions[Manifest.permission.ACCESS_COARSE_LOCATION] ?: false

        if (fineLocationGranted || coarseLocationGranted) {
            proceedToggleShift()
        } else {
            Toast.makeText(this, "Precise GNSS/GPS permission required for fleet tracking", Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        extractDriverSession()
        setupInitialState()
        setupServerUrl()
        setupListeners()
        observeServiceState()
        observeNetworkState()
        checkBatteryOptimizationStatus()
    }

    private fun extractDriverSession() {
        activeDriverName = intent.getStringExtra(LoginActivity.EXTRA_DRIVER_NAME) ?: run {
            val prefs = getSharedPreferences(LoginActivity.PREFS_NAME, Context.MODE_PRIVATE)
            prefs.getString(LoginActivity.KEY_DRIVER_NAME, "Captain: Ramesh Kumar (DRV-8821)") ?: "Captain Ramesh"
        }

        val incomingAssets = intent.getStringArrayListExtra(LoginActivity.EXTRA_ASSET_LIST)
        dynamicBusesList = if (!incomingAssets.isNullOrEmpty()) {
            incomingAssets
        } else {
            ArrayList(TelemetryUploader.FALLBACK_BUS_LIST)
        }

        binding.tvDriverProfileBadge.text = activeDriverName
    }

    private fun setupInitialState() {
        // Physical Identity Decoupling - Locked until QR scan or dynamic cloud binding
        binding.swipeSliderShift.setScanLocked(true)
        updateBoundVehicleDisplay(null)
    }

    private fun setupServerUrl() {
        binding.etServerUrl.setText(TelemetryUploader.DEFAULT_SERVER_URL)
    }

    private fun setupListeners() {
        // Driver Sign Out Action
        binding.btnSignOut.setOnClickListener {
            if (isShiftActive) {
                Toast.makeText(this, "Please conclude active shift before signing out", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            performSignOut()
        }

        // Google ML Kit QR Code Scanner
        binding.btnScanQr.setOnClickListener {
            if (isShiftActive) {
                Toast.makeText(this, "Conclude current shift before pairing another vehicle", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val intent = Intent(this, QrScannerActivity::class.java)
            qrScanLauncher.launch(intent)
        }

        // Dynamic Cloud Fleet Selector (GET /api/assets)
        binding.btnDynamicBusPicker.setOnClickListener {
            if (isShiftActive) {
                Toast.makeText(this, "Conclude current shift before re-assigning vehicle", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            showDynamicCloudBusPicker()
        }

        // Unbind Vehicle
        binding.btnClearVehicleTag.setOnClickListener {
            if (isShiftActive) return@setOnClickListener
            bindVehicleIdentity(null)
        }

        // Swipe Slider Confirmation Listener
        binding.swipeSliderShift.onSwipeCompleteListener = {
            checkPermissionsAndToggleShift()
        }

        binding.swipeSliderShift.onLockedTouchListener = {
            Toast.makeText(this, "Scan vehicle QR code first to unlock transponder", Toast.LENGTH_SHORT).show()
        }

        // ── 4-State DFSM State Transition Buttons ─────────────────────────
        // 1. 15-Minute Boarding Mode (Idle Timeout Suppressed)
        binding.btnStartBoarding.setOnClickListener {
            if (!isShiftActive) return@setOnClickListener
            dispatchStateTransition(LocationService.OperationalState.BOARDING_OPERATIONS)
            Toast.makeText(this, "Boarding Mode: Idle timeouts suppressed for 15+ mins", Toast.LENGTH_SHORT).show()
        }

        // 2. Campus Layover Mode (Privacy Mode)
        binding.btnToggleLayover.setOnClickListener {
            if (!isShiftActive) return@setOnClickListener
            dispatchStateTransition(LocationService.OperationalState.CAMPUS_LAYOVER)
            Toast.makeText(this, "Campus Layover: Telemetry tracking suspended", Toast.LENGTH_SHORT).show()
        }

        // 3. Resume Outbound Transit
        binding.btnResumeTransit.setOnClickListener {
            if (!isShiftActive) return@setOnClickListener
            dispatchStateTransition(LocationService.OperationalState.OUTBOUND_TRANSIT)
            Toast.makeText(this, "Outbound Transit Resumed", Toast.LENGTH_SHORT).show()
        }

        // Quick Ingestion Target Switchers
        binding.btnSetCloudUrl.setOnClickListener {
            binding.etServerUrl.setText(TelemetryUploader.DEFAULT_SERVER_URL)
            Toast.makeText(this, "Target: Render Cloud Production", Toast.LENGTH_SHORT).show()
        }

        binding.btnSetLocalUrl.setOnClickListener {
            binding.etServerUrl.setText(TelemetryUploader.LOCAL_SERVER_URL)
            Toast.makeText(this, "Target: Local LAN Gateway", Toast.LENGTH_SHORT).show()
        }

        // Battery Optimization Exemption
        binding.btnBatteryOpt.setOnClickListener {
            requestBatteryOptimizationExemption()
        }
    }

    private fun dispatchStateTransition(targetState: LocationService.OperationalState) {
        val intent = Intent(this, LocationService::class.java).apply {
            action = LocationService.ACTION_SET_STATE
            putExtra(LocationService.EXTRA_TARGET_STATE, targetState.name)
        }
        startService(intent)
    }

    private fun performSignOut() {
        val prefs = getSharedPreferences(LoginActivity.PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().clear().apply()

        val intent = Intent(this, LoginActivity::class.java)
        startActivity(intent)
        finish()
    }

    private fun bindVehicleIdentity(tag: String?) {
        boundAssetTag = tag
        updateBoundVehicleDisplay(tag)

        if (tag != null) {
            binding.swipeSliderShift.setScanLocked(false)
            Toast.makeText(this, "Vehicle Bound: $tag", Toast.LENGTH_SHORT).show()
        } else {
            binding.swipeSliderShift.setScanLocked(true)
            Toast.makeText(this, "Vehicle Unpaired", Toast.LENGTH_SHORT).show()
        }
    }

    private fun updateBoundVehicleDisplay(tag: String?) {
        if (tag != null) {
            binding.tvBoundAssetTag.text = tag
            binding.tvBoundAssetTag.setTextColor(ContextCompat.getColor(this, R.color.amber_electric))
            binding.tvBoundStatusBadge.text = "PAIRED"
            binding.tvBoundStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.emerald_online))
            binding.btnClearVehicleTag.visibility = if (isShiftActive) View.GONE else View.VISIBLE
        } else {
            binding.tvBoundAssetTag.text = "[ SCAN QR TO BIND ]"
            binding.tvBoundAssetTag.setTextColor(ContextCompat.getColor(this, R.color.slate_500))
            binding.tvBoundStatusBadge.text = "NOT PAIRED"
            binding.tvBoundStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.slate_400))
            binding.btnClearVehicleTag.visibility = View.GONE
        }
    }

    private fun showDynamicCloudBusPicker() {
        val busArray = dynamicBusesList.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("Active Cloud Fleet Assets")
            .setItems(busArray) { _, which ->
                bindVehicleIdentity(busArray[which])
            }
            .setNeutralButton("🔄 Refresh Cloud") { _, _ ->
                refreshCloudAssets()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun refreshCloudAssets() {
        val uploader = TelemetryUploader(applicationContext)
        lifecycleScope.launch {
            Toast.makeText(this@MainActivity, "Fetching latest assets from cloud...", Toast.LENGTH_SHORT).show()
            val freshBuses = uploader.fetchActiveBuses()
            dynamicBusesList = ArrayList(freshBuses)
            showDynamicCloudBusPicker()
        }
    }

    private fun checkPermissionsAndToggleShift() {
        val requiredPermissions = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requiredPermissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }

        val allGranted = requiredPermissions.all {
            ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
        }

        if (allGranted) {
            proceedToggleShift()
        } else {
            permissionLauncher.launch(requiredPermissions.toTypedArray())
        }
    }

    private fun proceedToggleShift() {
        val assetId = boundAssetTag ?: run {
            Toast.makeText(this, "Please scan vehicle QR code first", Toast.LENGTH_SHORT).show()
            binding.swipeSliderShift.setScanLocked(true)
            return
        }

        val serverEndpoint = binding.etServerUrl.text.toString().trim().ifEmpty {
            TelemetryUploader.DEFAULT_SERVER_URL
        }

        if (isShiftActive) {
            // Stop Shift
            val intent = Intent(this, LocationService::class.java).apply {
                action = LocationService.ACTION_STOP
            }
            startService(intent)
            Toast.makeText(this, "Shift Concluded: $assetId offline", Toast.LENGTH_SHORT).show()
        } else {
            // Start Shift in OUTBOUND_TRANSIT mode
            val intent = Intent(this, LocationService::class.java).apply {
                action = LocationService.ACTION_START
                putExtra(LocationService.EXTRA_ASSET_ID, assetId)
                putExtra(LocationService.EXTRA_SERVER_URL, serverEndpoint)
            }
            ContextCompat.startForegroundService(this, intent)
            Toast.makeText(this, "Shift Started: Live tracking active for $assetId", Toast.LENGTH_SHORT).show()
        }
    }

    private fun observeServiceState() {
        lifecycleScope.launch {
            LocationService.serviceState.collectLatest { state ->
                isShiftActive = state.isTracking
                if (state.isTracking && boundAssetTag == null) {
                    boundAssetTag = state.assetId
                    updateBoundVehicleDisplay(state.assetId)
                }
                updateUiForShiftState(state)
            }
        }
    }

    @SuppressLint("SetTextI18n")
    private fun updateUiForShiftState(state: LocationService.Companion.ServiceState) {
        // Sync interactive slider and lock state
        if (boundAssetTag != null) {
            binding.swipeSliderShift.setScanLocked(false)
            binding.swipeSliderShift.setShiftActive(state.isTracking)
        } else {
            binding.swipeSliderShift.setScanLocked(true)
        }

        // ── 4-State DFSM HUD Updates ───────────────────────────────────────
        val opState = state.operationalState
        binding.tvOperationalState.text = opState.label
        binding.tvOperationalState.setTextColor(ContextCompat.getColor(this, opState.badgeColor))

        if (state.isTracking) {
            binding.layoutDfsmActions.visibility = View.VISIBLE
            binding.btnScanQr.isEnabled = false
            binding.btnScanQr.alpha = 0.5f
            binding.btnDynamicBusPicker.isEnabled = false
            binding.btnClearVehicleTag.visibility = View.GONE
            binding.etServerUrl.isEnabled = false
            binding.btnSetCloudUrl.isEnabled = false
            binding.btnSetLocalUrl.isEnabled = false
        } else {
            binding.layoutDfsmActions.visibility = View.GONE
            binding.tvBoardingTimerHint.visibility = View.GONE
            binding.btnScanQr.isEnabled = true
            binding.btnScanQr.alpha = 1.0f
            binding.btnDynamicBusPicker.isEnabled = true
            binding.btnClearVehicleTag.visibility = if (boundAssetTag != null) View.VISIBLE else View.GONE
            binding.etServerUrl.isEnabled = true
            binding.btnSetCloudUrl.isEnabled = true
            binding.btnSetLocalUrl.isEnabled = true
        }

        when (opState) {
            LocationService.OperationalState.STANDBY -> {
                binding.radarPulseView.setPulsing(false)
                binding.tvLiveStatusBadge.text = "STANDBY"
                binding.tvLiveStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.status_standby))
                binding.tvBoardingTimerHint.visibility = View.GONE
            }

            LocationService.OperationalState.BOARDING_OPERATIONS -> {
                binding.radarPulseView.setPulsing(true)
                binding.tvLiveStatusBadge.text = "BOARDING"
                binding.tvLiveStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.status_boarding))
                binding.tvBoardingTimerHint.visibility = View.VISIBLE
                binding.tvBoardingTimerHint.text = "🚍 Boarding Active: Idle Timeouts Suppressed (15m+)"
            }

            LocationService.OperationalState.OUTBOUND_TRANSIT -> {
                binding.radarPulseView.setPulsing(true)
                binding.tvLiveStatusBadge.text = "TRANSMITTING"
                binding.tvLiveStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.status_transit))
                binding.tvBoardingTimerHint.visibility = View.GONE
            }

            LocationService.OperationalState.CAMPUS_LAYOVER -> {
                binding.radarPulseView.setPulsing(false)
                binding.tvLiveStatusBadge.text = "SUSPENDED"
                binding.tvLiveStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.status_layover))
                binding.tvBoardingTimerHint.visibility = View.GONE
            }
        }

        // Live Ground Speed (with Kinetic Deadband Filter)
        binding.tvLiveSpeed.text = String.format(Locale.US, "%.1f", state.speedKmh)
        if (state.speedKmh == 0.0) {
            binding.tvSpeedFilterLabel.text = "Kinetic Deadband Filter Active (Speed < 3.6 km/h = 0.0)"
            binding.tvSpeedFilterLabel.setTextColor(ContextCompat.getColor(this, R.color.slate_500))
        } else {
            binding.tvSpeedFilterLabel.text = "Moving Speed Ground Track Active"
            binding.tvSpeedFilterLabel.setTextColor(ContextCompat.getColor(this, R.color.emerald_online))
        }

        // Coordinates & Fused Accuracy
        if (state.latitude != 0.0 || state.longitude != 0.0) {
            binding.tvCoordinates.text = String.format(
                Locale.US,
                "%.5f, %.5f",
                state.latitude,
                state.longitude
            )
            binding.tvAccuracy.text = "±${String.format(Locale.US, "%.1f", state.accuracy)}m"
            binding.tvAccuracy.setTextColor(ContextCompat.getColor(this, R.color.emerald_online))
        } else {
            binding.tvCoordinates.text = "Awaiting GNSS / Fused Lock…"
            binding.tvAccuracy.text = "± -- m"
            binding.tvAccuracy.setTextColor(ContextCompat.getColor(this, R.color.slate_400))
        }

        // Anti-Spoofing Hardware Validation
        if (state.spoofDetectedCount > 0) {
            binding.tvAntiSpoofStatus.text = "ALERT: ${state.spoofDetectedCount} Fake GPS Blocked"
            binding.tvAntiSpoofStatus.setTextColor(ContextCompat.getColor(this, R.color.crimson_stop))
        } else {
            binding.tvAntiSpoofStatus.text = "GNSS Verified (0 Spoofed)"
            binding.tvAntiSpoofStatus.setTextColor(ContextCompat.getColor(this, R.color.emerald_online))
        }

        // Store-and-Forward SQLite Backlog Queue
        binding.tvOfflineQueue.text = "${state.unsyncedCount} pending records"
        if (state.unsyncedCount > 0) {
            binding.tvOfflineQueue.setTextColor(ContextCompat.getColor(this, R.color.amber_electric))
        } else {
            binding.tvOfflineQueue.setTextColor(ContextCompat.getColor(this, R.color.slate_400))
        }
    }

    private fun observeNetworkState() {
        connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()

        networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                val caps = connectivityManager?.getNetworkCapabilities(network)
                val type = when {
                    caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true -> "Connected (WiFi)"
                    caps?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true -> "Connected (4G/LTE)"
                    else -> "Connected (Active)"
                }
                runOnUiThread {
                    binding.tvNetworkStatus.text = type
                    binding.tvNetworkStatus.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.cyan_neon))
                }
            }

            override fun onLost(network: Network) {
                runOnUiThread {
                    binding.tvNetworkStatus.text = "Offline (Caching to SQLite)"
                    binding.tvNetworkStatus.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.amber_electric))
                }
            }
        }

        connectivityManager?.registerNetworkCallback(request, networkCallback!!)
    }

    private fun checkBatteryOptimizationStatus() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (powerManager.isIgnoringBatteryOptimizations(packageName)) {
            binding.btnBatteryOpt.text = "✓ Battery Optimization Bypassed"
            binding.btnBatteryOpt.setTextColor(ContextCompat.getColor(this, R.color.emerald_online))
            binding.btnBatteryOpt.isEnabled = false
        }
    }

    @SuppressLint("BatteryLife")
    private fun requestBatteryOptimizationExemption() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$packageName")
            }
            try {
                startActivity(intent)
            } catch (e: Exception) {
                val fallbackIntent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                startActivity(fallbackIntent)
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        networkCallback?.let {
            connectivityManager?.unregisterNetworkCallback(it)
        }
    }
}
