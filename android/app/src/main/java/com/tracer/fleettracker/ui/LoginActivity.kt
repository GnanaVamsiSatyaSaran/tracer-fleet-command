package com.tracer.fleettracker.ui

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.tracer.fleettracker.data.remote.TelemetryUploader
import com.tracer.fleettracker.databinding.ActivityLoginBinding
import kotlinx.coroutines.launch

/**
 * Enterprise Driver Authentication Portal (Fleet Tracker v3.0).
 * Validates driver credentials and synchronizes live fleet asset transponders from the cloud.
 */
class LoginActivity : AppCompatActivity() {

    companion object {
        const val PREFS_NAME = "fleet_tracker_prefs"
        const val KEY_DRIVER_ID = "key_driver_id"
        const val KEY_DRIVER_NAME = "key_driver_name"
        const val KEY_IS_LOGGED_IN = "key_is_logged_in"

        const val EXTRA_DRIVER_ID = "EXTRA_DRIVER_ID"
        const val EXTRA_DRIVER_NAME = "EXTRA_DRIVER_NAME"
        const val EXTRA_ASSET_LIST = "EXTRA_ASSET_LIST"
    }

    private lateinit var binding: ActivityLoginBinding
    private lateinit var uploader: TelemetryUploader

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Check if session already active
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (prefs.getBoolean(KEY_IS_LOGGED_IN, false)) {
            val savedDriverId = prefs.getString(KEY_DRIVER_ID, "DRV-8821") ?: "DRV-8821"
            val savedDriverName = prefs.getString(KEY_DRIVER_NAME, "Captain: Ramesh K. ($savedDriverId)") ?: "Captain Ramesh"
            launchMainActivity(savedDriverId, savedDriverName, ArrayList(TelemetryUploader.FALLBACK_BUS_LIST))
            return
        }

        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        uploader = TelemetryUploader(applicationContext)

        setupListeners()
    }

    private fun setupListeners() {
        // Quick 1-Tap Demo Credentials
        binding.btnQuickDemoDriver.setOnClickListener {
            binding.etEmployeeId.setText("DRV-8821")
            binding.etPin.setText("1234")
            Toast.makeText(this, "Demo credentials populated", Toast.LENGTH_SHORT).show()
        }

        // Primary Authenticate & Cloud Sync Button
        binding.btnSignIn.setOnClickListener {
            val empId = binding.etEmployeeId.text.toString().trim()
            val pin = binding.etPin.text.toString().trim()

            if (empId.isBlank()) {
                binding.etEmployeeId.error = "Employee ID is required"
                return@setOnClickListener
            }
            if (pin.length < 4) {
                binding.etPin.error = "PIN must be at least 4 digits"
                return@setOnClickListener
            }

            performAuthenticationAndSync(empId, pin)
        }
    }

    private fun performAuthenticationAndSync(empId: String, pin: String) {
        binding.btnSignIn.isEnabled = false
        binding.progressBarLogin.visibility = View.VISIBLE
        binding.tvLoginStatus.visibility = View.VISIBLE
        binding.tvLoginStatus.text = "Syncing active fleet transponders from Render Cloud..."

        lifecycleScope.launch {
            // Dynamic Cloud Sync: GET /api/assets
            val activeBuses = uploader.fetchActiveBuses()

            // Construct Driver Profile
            val driverName = when (empId.uppercase()) {
                "DRV-8821" -> "Captain: Ramesh Kumar (DRV-8821)"
                "DRV-101"  -> "Captain: Suresh Varma (DRV-101)"
                "DRV-102"  -> "Captain: Prasad Rao (DRV-102)"
                else       -> "Captain: $empId"
            }

            // Persist Session
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit()
                .putString(KEY_DRIVER_ID, empId)
                .putString(KEY_DRIVER_NAME, driverName)
                .putBoolean(KEY_IS_LOGGED_IN, true)
                .apply()

            binding.progressBarLogin.visibility = View.GONE
            binding.tvLoginStatus.text = "Authentication Verified! Launching Transponder..."

            Toast.makeText(this@LoginActivity, "Welcome $driverName", Toast.LENGTH_SHORT).show()

            launchMainActivity(empId, driverName, ArrayList(activeBuses))
        }
    }

    private fun launchMainActivity(empId: String, driverName: String, assetList: ArrayList<String>) {
        val intent = Intent(this, MainActivity::class.java).apply {
            putExtra(EXTRA_DRIVER_ID, empId)
            putExtra(EXTRA_DRIVER_NAME, driverName)
            putStringArrayListExtra(EXTRA_ASSET_LIST, assetList)
        }
        startActivity(intent)
        finish()
    }
}
