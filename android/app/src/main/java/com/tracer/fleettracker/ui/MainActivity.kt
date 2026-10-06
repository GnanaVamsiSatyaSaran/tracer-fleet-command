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
 * Enterprise Driver Console HUD:
 * - Feature 1: Physical Identity Decoupling (Google ML Kit Vision QR Scanner)
 * - Feature 2: Anti-Degradation Location Tracking via Google Play Services FusedLocationProviderClient
 * - Feature 3: Deterministic Finite State Machine (DFSM) Heads-Up Display
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var isShiftActive = false
    private var isLayoverActive = false
    private var boundAssetTag: String? = null

    private val fallbackBusTags = arrayOf(
        "GITAM-BUS-01",
        "GITAM-BUS-02",
        "GITAM-BUS-03",
        "GITAM-BUS-04",
        "GITAM-BUS-05"
    )

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

        setupInitialState()
        setupServerUrl()
        setupListeners()
        observeServiceState()
        observeNetworkState()
        checkBatteryOptimizationStatus()
    }

    private fun setupInitialState() {
        // Feature 1: Physical Identity Decoupling - Stays locked until QR Code scan binds the phone
        binding.swipeSliderShift.setScanLocked(true)
        updateBoundVehicleDisplay(null)
    }

    private fun setupServerUrl() {
        // Defaults to live Render Cloud production endpoint
        binding.etServerUrl.setText(TelemetryUploader.DEFAULT_SERVER_URL)
    }

    private fun setupListeners() {
        // Feature 1: QR Scanner Action
        binding.btnScanQr.setOnClickListener {
            if (isShiftActive) {
                Toast.makeText(this, "Conclude current shift before pairing another vehicle", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val intent = Intent(this, QrScannerActivity::class.java)
            qrScanLauncher.launch(intent)
        }

        // Quick Tag Manual Override Picker
        binding.btnQuickTagPicker.setOnClickListener {
            if (isShiftActive) {
                Toast.makeText(this, "Conclude current shift before re-assigning vehicle", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            showQuickTagDialog()
        }

        // Clear / Unbind Vehicle
        binding.btnClearVehicleTag.setOnClickListener {
            if (isShiftActive) return@setOnClickListener
            bindVehicleIdentity(null)
        }

        // Feature 1: Interactive Swipe Slider
        binding.swipeSliderShift.onSwipeCompleteListener = {
            checkPermissionsAndToggleShift()
        }

        binding.swipeSliderShift.onLockedTouchListener = {
            Toast.makeText(this, "Scan vehicle QR code first to unlock transponder", Toast.LENGTH_SHORT).show()
        }

        // Feature 3: DFSM Campus Layover Toggle Action
        binding.btnToggleLayover.setOnClickListener {
            if (!isShiftActive) return@setOnClickListener
            isLayoverActive = !isLayoverActive
            val intent = Intent(this, LocationService::class.java).apply {
                action = LocationService.ACTION_SET_LAYOVER
                putExtra(LocationService.EXTRA_IS_LAYOVER, isLayoverActive)
            }
            startService(intent)
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

    private fun bindVehicleIdentity(tag: String?) {
        boundAssetTag = tag
        updateBoundVehicleDisplay(tag)

        if (tag != null) {
            // Unlock the Swipe-to-Start Shift slider
            binding.swipeSliderShift.setScanLocked(false)
            Toast.makeText(this, "Phone Bound to Vehicle: $tag", Toast.LENGTH_SHORT).show()
        } else {
            // Lock the slider
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

    private fun showQuickTagDialog() {
        AlertDialog.Builder(this)
            .setTitle("Select Vehicle Transponder")
            .setItems(fallbackBusTags) { _, which ->
                bindVehicleIdentity(fallbackBusTags[which])
            }
            .setNegativeButton("Cancel", null)
            .show()
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
            isLayoverActive = false
            Toast.makeText(this, "Shift Ended: $assetId transponder offline", Toast.LENGTH_SHORT).show()
        } else {
            // Start Shift
            isLayoverActive = false
            val intent = Intent(this, LocationService::class.java).apply {
                action = LocationService.ACTION_START
                putExtra(LocationService.EXTRA_ASSET_ID, assetId)
                putExtra(LocationService.EXTRA_SERVER_URL, serverEndpoint)
            }
            ContextCompat.startForegroundService(this, intent)
            Toast.makeText(this, "Shift Started: Live tracking for $assetId", Toast.LENGTH_SHORT).show()
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

        // Feature 3: DFSM Heads-Up Display (State Machine UI)
        val opState = state.operationalState
        binding.tvOperationalState.text = opState.label
        binding.tvOperationalState.setTextColor(ContextCompat.getColor(this, opState.badgeColor))

        when (opState) {
            LocationService.OperationalState.STANDBY -> {
                binding.radarPulseView.setPulsing(false)
                binding.tvLiveStatusBadge.text = "STANDBY"
                binding.tvLiveStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.slate_400))

                binding.btnToggleLayover.visibility = View.GONE
                binding.btnScanQr.isEnabled = true
                binding.btnScanQr.alpha = 1.0f
                binding.btnClearVehicleTag.visibility = if (boundAssetTag != null) View.VISIBLE else View.GONE
                binding.etServerUrl.isEnabled = true
                binding.btnSetCloudUrl.isEnabled = true
                binding.btnSetLocalUrl.isEnabled = true
            }

            LocationService.OperationalState.INBOUND_TRANSIT -> {
                binding.radarPulseView.setPulsing(true)
                binding.tvLiveStatusBadge.text = "TRANSMITTING"
                binding.tvLiveStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.emerald_online))

                binding.btnToggleLayover.visibility = View.VISIBLE
                binding.tvLayoverActionLabel.text = "⏸️ Enter Campus Layover (Privacy Mode)"
                binding.tvLayoverActionLabel.setTextColor(ContextCompat.getColor(this, R.color.cyan_neon))

                binding.btnScanQr.isEnabled = false
                binding.btnScanQr.alpha = 0.5f
                binding.btnClearVehicleTag.visibility = View.GONE
                binding.etServerUrl.isEnabled = false
                binding.btnSetCloudUrl.isEnabled = false
                binding.btnSetLocalUrl.isEnabled = false
            }

            LocationService.OperationalState.CAMPUS_LAYOVER -> {
                // Privacy Mode: Pulse paused to assure driver
                binding.radarPulseView.setPulsing(false)
                binding.tvLiveStatusBadge.text = "SUSPENDED"
                binding.tvLiveStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.cyan_neon))

                binding.btnToggleLayover.visibility = View.VISIBLE
                binding.tvLayoverActionLabel.text = "▶️ Resume Inbound Route"
                binding.tvLayoverActionLabel.setTextColor(ContextCompat.getColor(this, R.color.amber_electric))

                binding.btnScanQr.isEnabled = false
                binding.btnScanQr.alpha = 0.5f
                binding.btnClearVehicleTag.visibility = View.GONE
                binding.etServerUrl.isEnabled = false
                binding.btnSetCloudUrl.isEnabled = false
                binding.btnSetLocalUrl.isEnabled = false
            }
        }

        // Live Ground Speed
        binding.tvLiveSpeed.text = String.format(Locale.US, "%.1f", state.speedKmh)

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
            binding.tvOfflineQueue.setTextColor(ContextCompat.getColor(this, R.color.amber_electric))
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
