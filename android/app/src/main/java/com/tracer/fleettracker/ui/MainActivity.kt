package com.tracer.fleettracker.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
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
 * Driver Console UI: High-contrast, distraction-free emitter dashboard.
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

    // Runtime Permission Request Contract
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val fineLocationGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] ?: false
        val coarseLocationGranted = permissions[Manifest.permission.ACCESS_COARSE_LOCATION] ?: false

        if (fineLocationGranted || coarseLocationGranted) {
            proceedToggleShift()
        } else {
            Toast.makeText(this, "Precise GPS permission required to track vehicle", Toast.LENGTH_LONG).show()
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
        checkBatteryOptimizationStatus()
    }

    private fun setupBusSpinner() {
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, busOptions)
        binding.spinnerBusId.adapter = adapter
    }

    private fun setupServerUrl() {
        // Defaults to local Node.js backend port 3000
        binding.etServerUrl.setText(TelemetryUploader.DEFAULT_SERVER_URL)
    }

    private fun setupListeners() {
        binding.btnToggleShift.setOnClickListener {
            checkPermissionsAndToggleShift()
        }

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
        val selectedBusId = binding.spinnerBusId.selectedItem.toString()
        val serverEndpoint = binding.etServerUrl.text.toString().trim()

        if (isShiftActive) {
            // Stop Shift
            val intent = Intent(this, LocationService::class.java).apply {
                action = LocationService.ACTION_STOP
            }
            startService(intent)
            Toast.makeText(this, "Shift Concluded for $selectedBusId", Toast.LENGTH_SHORT).show()
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
        if (state.isTracking) {
            // Running State (Crimson Stop Button)
            binding.btnToggleShift.text = getString(R.string.end_shift)
            binding.btnToggleShift.setBackgroundColor(ContextCompat.getColor(this, R.color.crimson_stop))
            binding.btnToggleShift.setTextColor(ContextCompat.getColor(this, R.color.white))

            binding.tvLiveStatusBadge.text = "TRANSMITTING"
            binding.tvLiveStatusBadge.setBackgroundColor(ContextCompat.getColor(this, R.color.midnight_surface))
            binding.tvLiveStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.emerald_online))

            binding.spinnerBusId.isEnabled = false
            binding.etServerUrl.isEnabled = false
        } else {
            // Standby State (Electric Amber Start Button)
            binding.btnToggleShift.text = getString(R.string.start_shift)
            binding.btnToggleShift.setBackgroundColor(ContextCompat.getColor(this, R.color.amber_primary))
            binding.btnToggleShift.setTextColor(ContextCompat.getColor(this, R.color.midnight_dark))

            binding.tvLiveStatusBadge.text = "STANDBY"
            binding.tvLiveStatusBadge.setBackgroundColor(ContextCompat.getColor(this, R.color.slate_800))
            binding.tvLiveStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.slate_400))

            binding.spinnerBusId.isEnabled = true
            binding.etServerUrl.isEnabled = true
        }

        // Live Speed
        binding.tvLiveSpeed.text = String.format(Locale.US, "%.1f", state.speedKmh)

        // Coordinates & Accuracy
        if (state.latitude != 0.0 || state.longitude != 0.0) {
            binding.tvCoordinates.text = String.format(
                Locale.US,
                "%.5f, %.5f",
                state.latitude,
                state.longitude
            )
            binding.tvAccuracy.text = "±${state.accuracy.toInt()}m"
        } else {
            binding.tvCoordinates.text = "Awaiting lock…"
            binding.tvAccuracy.text = "± -- m"
        }

        // Anti-Spoofing Indicator
        if (state.spoofDetectedCount > 0) {
            binding.tvAntiSpoofStatus.text = "ALERT: ${state.spoofDetectedCount} Fake GPS Blocked"
            binding.tvAntiSpoofStatus.setTextColor(ContextCompat.getColor(this, R.color.crimson_stop))
        } else {
            binding.tvAntiSpoofStatus.text = "Hardware GNSS (0 Blocked)"
            binding.tvAntiSpoofStatus.setTextColor(ContextCompat.getColor(this, R.color.emerald_online))
        }

        // Store-and-Forward Offline Queue Counter
        binding.tvOfflineQueue.text = "${state.unsyncedCount} pending records"
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
}
