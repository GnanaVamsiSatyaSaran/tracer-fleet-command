package com.tracer.fleettracker.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
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
 * Fleet Tracker v3.0 Commercial Driver Console:
 * - Real-World Commercial UI (Uber Driver Inspired with crisp white cards, charcoal text, emerald accents)
 * - Thumb-Friendly "GO / START DUTY" and "OFFLINE" Control
 * - 4-State DFSM (STANDBY, AT CAMPUS / BOARDING, OUTBOUND TRANSIT, CAMPUS LAYOVER)
 * - 15-Minute Campus Boarding: Idle timeouts suppressed while loading students
 * - Kinetic Deadband Filter: Speeds < 1.0 m/s (~3.6 km/h) clamped to 0.0 km/h
 * - Frictionless QR Scanner Integration (Google ML Kit Vision + CameraX)
 * - Store-and-Forward SQLite Room Database & Anti-Spoofing Hardware Validation
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var isShiftActive = false
    private var boundAssetTag: String? = null
    private var activeDriverName: String = "Captain Ramesh Kumar"
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
                promptStartDutyAfterSelection(scannedTag)
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
            prefs.getString(LoginActivity.KEY_DRIVER_NAME, "Captain Ramesh Kumar") ?: "Captain Ramesh"
        }

        val incomingAssets = intent.getStringArrayListExtra(LoginActivity.EXTRA_ASSET_LIST)
        dynamicBusesList = if (!incomingAssets.isNullOrEmpty()) {
            incomingAssets
        } else {
            ArrayList(TelemetryUploader.FALLBACK_BUS_LIST)
        }

        binding.tvDriverProfileBadge.text = "$activeDriverName • 4.9 ★"

        // Derive avatar initials
        val cleanName = activeDriverName.replace("Captain:", "").replace("Captain", "").trim()
        val initials = cleanName.split(" ")
            .filter { it.isNotBlank() }
            .take(2)
            .map { it.first().uppercase() }
            .joinToString("")
        binding.tvDriverAvatarInitials.text = if (initials.isNotBlank()) initials else "RK"
    }

    private fun setupInitialState() {
        updateBoundVehicleDisplay(null)
        updateShiftButtonState(false)
    }

    private fun setupServerUrl() {
        binding.etServerUrl.setText(TelemetryUploader.DEFAULT_SERVER_URL)
    }

    private fun setupListeners() {
        // Driver Sign Out Action
        binding.btnSignOut.setOnClickListener {
            if (isShiftActive) {
                Toast.makeText(this, "Please end active duty before signing out", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            performSignOut()
        }

        // Google ML Kit QR Code Scanner
        binding.btnScanQr.setOnClickListener {
            if (isShiftActive) {
                Toast.makeText(this, "Conclude current duty before scanning another vehicle", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val intent = Intent(this, QrScannerActivity::class.java)
            qrScanLauncher.launch(intent)
        }

        // Dynamic Cloud Fleet Selector (GET /api/assets)
        binding.btnDynamicBusPicker.setOnClickListener {
            if (isShiftActive) {
                Toast.makeText(this, "Conclude current duty before switching vehicle", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            showDynamicCloudBusPicker()
        }

        // Unbind / Change Vehicle
        binding.btnClearVehicleTag.setOnClickListener {
            if (isShiftActive) return@setOnClickListener
            bindVehicleIdentity(null)
        }

        // ── Large Thumb-Friendly Shift Control (Uber Driver GO / OFFLINE Button) ──
        binding.btnShiftToggleAction.setOnClickListener {
            if (boundAssetTag == null && !isShiftActive) {
                Toast.makeText(this, "Please scan bus QR code before starting duty", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }
            checkPermissionsAndToggleShift()
        }

        // ── 4-State DFSM Operational Mode Controls ─────────────────────────
        // 1. At Campus (Boarding) Mode - Idle Timeout Suppressed for 15+ minutes
        binding.btnStartBoarding.setOnClickListener {
            if (!isShiftActive) return@setOnClickListener
            dispatchStateTransition(LocationService.OperationalState.BOARDING_OPERATIONS)
            Toast.makeText(this, "At Campus (Boarding): Idle timeouts suppressed for 15+ mins", Toast.LENGTH_SHORT).show()
        }

        // 2. In Transit (Outbound Route)
        binding.btnResumeTransit.setOnClickListener {
            if (!isShiftActive) return@setOnClickListener
            dispatchStateTransition(LocationService.OperationalState.OUTBOUND_TRANSIT)
            Toast.makeText(this, "Outbound transit active", Toast.LENGTH_SHORT).show()
        }

        // 3. Layover Mode (Privacy / Pause)
        binding.btnToggleLayover.setOnClickListener {
            if (!isShiftActive) return@setOnClickListener
            dispatchStateTransition(LocationService.OperationalState.CAMPUS_LAYOVER)
            Toast.makeText(this, "Layover mode: GPS streaming paused", Toast.LENGTH_SHORT).show()
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
            Toast.makeText(this, "✓ Verified Vehicle: $tag", Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(this, "Vehicle Unpaired", Toast.LENGTH_SHORT).show()
        }
    }

    private fun updateBoundVehicleDisplay(tag: String?) {
        if (tag != null) {
            binding.tvBoundAssetTag.text = "✓ $tag (Verified)"
            binding.tvBoundAssetTag.setTextColor(ContextCompat.getColor(this, R.color.commercial_emerald_dark))
            binding.tvBoundStatusBadge.text = "VERIFIED"
            binding.tvBoundStatusBadge.setBackgroundResource(R.drawable.bg_commercial_badge_emerald)
            binding.tvBoundStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.commercial_emerald_dark))
            binding.btnClearVehicleTag.visibility = if (isShiftActive) View.GONE else View.VISIBLE
        } else {
            binding.tvBoundAssetTag.text = "[ SCAN QR CODE TO PAIR ]"
            binding.tvBoundAssetTag.setTextColor(ContextCompat.getColor(this, R.color.commercial_charcoal))
            binding.tvBoundStatusBadge.text = "UNPAIRED"
            binding.tvBoundStatusBadge.setBackgroundResource(R.drawable.bg_commercial_input)
            binding.tvBoundStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.commercial_charcoal_light))
            binding.btnClearVehicleTag.visibility = View.GONE
        }
    }

    private fun updateShiftButtonState(tracking: Boolean) {
        if (tracking) {
            binding.btnShiftToggleAction.setBackgroundResource(R.drawable.bg_commercial_btn_offline)
            binding.tvShiftActionIcon.text = "⏹️ "
            binding.tvShiftActionText.text = "OFFLINE / END DUTY"
        } else {
            binding.btnShiftToggleAction.setBackgroundResource(R.drawable.bg_commercial_btn_go)
            binding.tvShiftActionIcon.text = "⚡ "
            binding.tvShiftActionText.text = "GO / START DUTY"
        }
    }

    private fun showDynamicCloudBusPicker() {
        val busArray = dynamicBusesList.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("Select Vehicle Asset")
            .setItems(busArray) { _, which ->
                val chosen = busArray[which]
                bindVehicleIdentity(chosen)
                promptStartDutyAfterSelection(chosen)
            }
            .setNeutralButton("🔄 Refresh Cloud") { _, _ ->
                refreshCloudAssets()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun promptStartDutyAfterSelection(tag: String) {
        AlertDialog.Builder(this)
            .setTitle("Vehicle Assigned: $tag")
            .setMessage("Vehicle $tag is verified. Start active duty and begin live GPS transmission now?")
            .setPositiveButton("⚡ Start Duty Now") { _, _ ->
                checkPermissionsAndToggleShift()
            }
            .setNegativeButton("Later (Stay Offline)", null)
            .show()
    }

    private fun refreshCloudAssets() {
        val uploader = TelemetryUploader(applicationContext)
        lifecycleScope.launch {
            Toast.makeText(this@MainActivity, "Fetching latest fleet from cloud...", Toast.LENGTH_SHORT).show()
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
            Toast.makeText(this, "Please scan bus QR code first", Toast.LENGTH_SHORT).show()
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
            Toast.makeText(this, "Duty Ended: $assetId is offline", Toast.LENGTH_SHORT).show()
        } else {
            // Start Shift in OUTBOUND_TRANSIT mode
            val intent = Intent(this, LocationService::class.java).apply {
                action = LocationService.ACTION_START
                putExtra(LocationService.EXTRA_ASSET_ID, assetId)
                putExtra(LocationService.EXTRA_SERVER_URL, serverEndpoint)
            }
            ContextCompat.startForegroundService(this, intent)
            Toast.makeText(this, "Duty Started: Tracking active for $assetId", Toast.LENGTH_SHORT).show()
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
        updateShiftButtonState(state.isTracking)

        // ── 4-State DFSM Operational Mode Updates ──────────────────────────
        val opState = state.operationalState

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
                binding.layoutDutyBanner.setBackgroundColor(Color.parseColor("#E5E7EB"))
                binding.tvLiveStatusBadge.text = "OFFLINE • TAP GO TO START"
                binding.tvLiveStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.commercial_charcoal))
                binding.tvOperationalState.text = "STANDBY"
                binding.tvBoardingTimerHint.visibility = View.GONE
            }

            LocationService.OperationalState.BOARDING_OPERATIONS -> {
                binding.layoutDutyBanner.setBackgroundColor(Color.parseColor("#FEF3C7"))
                binding.tvLiveStatusBadge.text = "AT CAMPUS (BOARDING)"
                binding.tvLiveStatusBadge.setTextColor(Color.parseColor("#B45309"))
                binding.tvOperationalState.text = "BOARDING"
                binding.tvBoardingTimerHint.visibility = View.VISIBLE
                binding.tvBoardingTimerHint.text = "🚍 At Campus (Boarding) • Idle timeouts suppressed for 15+ mins"
            }

            LocationService.OperationalState.OUTBOUND_TRANSIT -> {
                binding.layoutDutyBanner.setBackgroundColor(Color.parseColor("#D1FAE5"))
                binding.tvLiveStatusBadge.text = "ON DUTY • STREAMING GPS"
                binding.tvLiveStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.commercial_emerald_dark))
                binding.tvOperationalState.text = "IN TRANSIT"
                binding.tvBoardingTimerHint.visibility = View.GONE
            }

            LocationService.OperationalState.CAMPUS_LAYOVER -> {
                binding.layoutDutyBanner.setBackgroundColor(Color.parseColor("#EFF6FF"))
                binding.tvLiveStatusBadge.text = "CAMPUS LAYOVER (PAUSED)"
                binding.tvLiveStatusBadge.setTextColor(Color.parseColor("#1D4ED8"))
                binding.tvOperationalState.text = "LAYOVER"
                binding.tvBoardingTimerHint.visibility = View.GONE
            }
        }

        // Live Ground Speed (with Kinetic Deadband Filter)
        binding.tvLiveSpeed.text = String.format(Locale.US, "%.1f", state.speedKmh)
        if (state.speedKmh == 0.0) {
            binding.tvSpeedFilterLabel.text = "Rest Speed Drift Filter Active (< 3.6 km/h = 0.0)"
            binding.tvSpeedFilterLabel.setTextColor(ContextCompat.getColor(this, R.color.commercial_charcoal_muted))
        } else {
            binding.tvSpeedFilterLabel.text = "Moving Ground Track Active"
            binding.tvSpeedFilterLabel.setTextColor(ContextCompat.getColor(this, R.color.commercial_emerald_dark))
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
            binding.tvAccuracy.setTextColor(ContextCompat.getColor(this, R.color.commercial_emerald_dark))
        } else {
            binding.tvCoordinates.text = "Awaiting GNSS Position…"
            binding.tvAccuracy.text = "± -- m"
            binding.tvAccuracy.setTextColor(ContextCompat.getColor(this, R.color.commercial_charcoal_light))
        }

        // Anti-Spoofing Hardware Security Status
        if (state.spoofDetectedCount > 0) {
            binding.tvAntiSpoofStatus.text = "ALERT: ${state.spoofDetectedCount} Fake GPS Blocked"
            binding.tvAntiSpoofStatus.setTextColor(ContextCompat.getColor(this, R.color.commercial_red))
        } else {
            binding.tvAntiSpoofStatus.text = "Hardware Verified (0 Mock)"
            binding.tvAntiSpoofStatus.setTextColor(ContextCompat.getColor(this, R.color.commercial_emerald_dark))
        }

        // SQLite Offline Backlog Queue
        binding.tvOfflineQueue.text = "${state.unsyncedCount} pending records"
        if (state.unsyncedCount > 0) {
            binding.tvOfflineQueue.setTextColor(ContextCompat.getColor(this, R.color.commercial_amber))
        } else {
            binding.tvOfflineQueue.setTextColor(ContextCompat.getColor(this, R.color.commercial_charcoal_light))
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
                    caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true -> "Online (WiFi)"
                    caps?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true -> "Online (4G/LTE)"
                    else -> "Online (Connected)"
                }
                runOnUiThread {
                    binding.tvNetworkStatus.text = type
                    binding.tvNetworkStatus.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.commercial_blue))
                }
            }

            override fun onLost(network: Network) {
                runOnUiThread {
                    binding.tvNetworkStatus.text = "Offline (Caching to SQLite)"
                    binding.tvNetworkStatus.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.commercial_amber))
                }
            }
        }

        connectivityManager?.registerNetworkCallback(request, networkCallback!!)
    }

    private fun checkBatteryOptimizationStatus() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (powerManager.isIgnoringBatteryOptimizations(packageName)) {
            binding.btnBatteryOpt.text = "✓ Background Battery Optimization Bypassed"
            binding.btnBatteryOpt.setTextColor(ContextCompat.getColor(this, R.color.commercial_emerald_dark))
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
