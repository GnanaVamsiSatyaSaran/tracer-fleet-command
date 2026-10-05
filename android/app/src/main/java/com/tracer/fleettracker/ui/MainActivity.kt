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
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
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
 * Driver Console UI: High-contrast Obsidian Dark HUD Emitter Dashboard.
 * Designed for professional transit operations, zero accidental taps, and real-time GNSS telemetry.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var isShiftActive = false

    private val busOptions = arrayOf(
        "GITAM-BUS-01",
        "GITAM-BUS-02",
        "GITAM-BUS-03",
        "GITAM-BUS-04",
        "GITAM-BUS-05"
    )

    private var connectivityManager: ConnectivityManager? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    // Runtime Permission Request Contract
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val fineLocationGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] ?: false
        val coarseLocationGranted = permissions[Manifest.permission.ACCESS_COARSE_LOCATION] ?: false

        if (fineLocationGranted || coarseLocationGranted) {
            proceedToggleShift()
        } else {
            Toast.makeText(this, "Precise GNSS/GPS permission required for fleet tracking", Toast.LENGTH_LONG).show()
            binding.swipeSliderShift.setShiftActive(false)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupBusSpinner()
        setupServerUrl()
        setupListeners()
        observeServiceState()
        observeNetworkState()
        checkBatteryOptimizationStatus()
    }

    private fun setupBusSpinner() {
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, busOptions)
        binding.spinnerBusId.adapter = adapter
    }

    private fun setupServerUrl() {
        // Defaults to live Render Cloud production endpoint
        binding.etServerUrl.setText(TelemetryUploader.DEFAULT_SERVER_URL)
    }

    private fun setupListeners() {
        // Interactive Swipe-to-Start Shift Component
        binding.swipeSliderShift.onSwipeCompleteListener = {
            checkPermissionsAndToggleShift()
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
        val selectedBusId = binding.spinnerBusId.selectedItem?.toString() ?: "GITAM-BUS-01"
        val serverEndpoint = binding.etServerUrl.text.toString().trim().ifEmpty {
            TelemetryUploader.DEFAULT_SERVER_URL
        }

        if (isShiftActive) {
            // Stop Shift
            val intent = Intent(this, LocationService::class.java).apply {
                action = LocationService.ACTION_STOP
            }
            startService(intent)
            Toast.makeText(this, "Shift Ended: $selectedBusId offline", Toast.LENGTH_SHORT).show()
        } else {
            // Start Shift
            val intent = Intent(this, LocationService::class.java).apply {
                action = LocationService.ACTION_START
                putExtra(LocationService.EXTRA_ASSET_ID, selectedBusId)
                putExtra(LocationService.EXTRA_SERVER_URL, serverEndpoint)
            }
            ContextCompat.startForegroundService(this, intent)
            Toast.makeText(this, "Shift Started: Transmitting live GPS for $selectedBusId", Toast.LENGTH_SHORT).show()
        }
    }

    private fun observeServiceState() {
        lifecycleScope.launch {
            LocationService.serviceState.collectLatest { state ->
                isShiftActive = state.isTracking
                updateUiForShiftState(state)
            }
        }
    }

    @SuppressLint("SetTextI18n")
    private fun updateUiForShiftState(state: LocationService.Companion.ServiceState) {
        // Sync interactive slider and radar HUD
        binding.swipeSliderShift.setShiftActive(state.isTracking)
        binding.radarPulseView.setPulsing(state.isTracking)

        if (state.isTracking) {
            // Live Transmitting State
            binding.tvLiveStatusBadge.text = "TRANSMITTING"
            binding.tvLiveStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.emerald_online))

            binding.tvTransmittingHudTag.text = "TRANSMITTING LIVE GPS"
            binding.tvTransmittingHudTag.setTextColor(ContextCompat.getColor(this, R.color.amber_electric))

            binding.spinnerBusId.isEnabled = false
            binding.etServerUrl.isEnabled = false
            binding.btnSetCloudUrl.isEnabled = false
            binding.btnSetLocalUrl.isEnabled = false
        } else {
            // Standby State
            binding.tvLiveStatusBadge.text = "STANDBY"
            binding.tvLiveStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.slate_400))

            binding.tvTransmittingHudTag.text = "TRANSPONDER STANDBY"
            binding.tvTransmittingHudTag.setTextColor(ContextCompat.getColor(this, R.color.slate_400))

            binding.spinnerBusId.isEnabled = true
            binding.etServerUrl.isEnabled = true
            binding.btnSetCloudUrl.isEnabled = true
            binding.btnSetLocalUrl.isEnabled = true
        }

        // Live Ground Speed
        binding.tvLiveSpeed.text = String.format(Locale.US, "%.1f", state.speedKmh)

        // Coordinates & GNSS Accuracy
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
            binding.tvCoordinates.text = "Awaiting GNSS lock…"
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

        // Store-and-Forward SQLite Backlog Count
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
