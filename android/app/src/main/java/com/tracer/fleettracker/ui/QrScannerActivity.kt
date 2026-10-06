package com.tracer.fleettracker.ui

import android.Manifest
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
import android.view.HapticFeedbackConstants
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.OptIn
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.tracer.fleettracker.databinding.ActivityQrScannerBinding
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Enterprise Physical Identity Decoupling: Google ML Kit Vision QR Scanner.
 * Accurately scans vehicle transponder QR codes with an Obsidian Dark HUD viewfinder.
 */
class QrScannerActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_ASSET_TAG = "EXTRA_ASSET_TAG"
        private const val TAG = "QrScannerActivity"
    }

    private lateinit var binding: ActivityQrScannerBinding
    private lateinit var cameraExecutor: ExecutorService
    private var barcodeScanner: BarcodeScanner? = null
    private var camera: Camera? = null
    private var isTorchOn = false
    private var hasScanned = false
    private var laserAnimator: ValueAnimator? = null

    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            startCamera()
        } else {
            Toast.makeText(this, "Camera permission required to scan vehicle QR codes", Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityQrScannerBinding.inflate(layoutInflater)
        setContentView(binding.root)

        cameraExecutor = Executors.newSingleThreadExecutor()

        // Configure Google ML Kit Barcode Scanner for QR Codes
        val options = BarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .build()
        barcodeScanner = BarcodeScanning.getClient(options)

        setupListeners()
        setupLaserAnimation()
        checkCameraPermissionAndStart()
    }

    private fun setupListeners() {
        binding.btnClose.setOnClickListener {
            finish()
        }

        binding.btnToggleFlash.setOnClickListener {
            isTorchOn = !isTorchOn
            camera?.cameraControl?.enableTorch(isTorchOn)
        }

        // Quick Tag Selection Chips for instantaneous driver testing
        val quickChips = listOf(
            binding.chipBus01 to "GITAM-BUS-01",
            binding.chipBus02 to "GITAM-BUS-02",
            binding.chipBus03 to "GITAM-BUS-03",
            binding.chipBus04 to "GITAM-BUS-04",
            binding.chipBus05 to "GITAM-BUS-05"
        )

        quickChips.forEach { (chipView, tag) ->
            chipView.setOnClickListener {
                onSuccessfulScan(tag)
            }
        }
    }

    private fun setupLaserAnimation() {
        binding.scanFrame.post {
            val height = binding.scanFrame.height.toFloat()
            laserAnimator = ValueAnimator.ofFloat(0f, height).apply {
                duration = 2000
                repeatMode = ValueAnimator.REVERSE
                repeatCount = ValueAnimator.INFINITE
                interpolator = AccelerateDecelerateInterpolator()
                addUpdateListener { anim ->
                    binding.laserScannerLine.translationY = anim.animatedValue as Float
                }
                start()
            }
        }
    }

    private fun checkCameraPermissionAndStart() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            val cameraProvider: ProcessCameraProvider = cameraProviderFuture.get()

            // Preview Surface
            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(binding.viewFinder.surfaceProvider)
            }

            // Image Analyzer with ML Kit
            val imageAnalyzer = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
                .also {
                    it.setAnalyzer(cameraExecutor) { imageProxy ->
                        processImageProxy(imageProxy)
                    }
                }

            val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

            try {
                cameraProvider.unbindAll()
                camera = cameraProvider.bindToLifecycle(this, cameraSelector, preview, imageAnalyzer)
            } catch (exc: Exception) {
                Log.e(TAG, "Use case binding failed", exc)
            }
        }, ContextCompat.getMainExecutor(this))
    }

    @OptIn(ExperimentalGetImage::class)
    private fun processImageProxy(imageProxy: ImageProxy) {
        if (hasScanned) {
            imageProxy.close()
            return
        }

        val mediaImage = imageProxy.image
        if (mediaImage != null) {
            val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
            barcodeScanner?.process(image)
                ?.addOnSuccessListener { barcodes ->
                    for (barcode in barcodes) {
                        val rawValue = barcode.rawValue ?: barcode.displayValue
                        if (!rawValue.isNullOrBlank() && !hasScanned) {
                            val parsedTag = sanitizeAssetTag(rawValue)
                            if (parsedTag.isNotEmpty()) {
                                hasScanned = true
                                runOnUiThread {
                                    onSuccessfulScan(parsedTag)
                                }
                                break
                            }
                        }
                    }
                }
                ?.addOnFailureListener { e ->
                    Log.w(TAG, "Barcode analysis failed: ${e.localizedMessage}")
                }
                ?.addOnCompleteListener {
                    imageProxy.close()
                }
        } else {
            imageProxy.close()
        }
    }

    /**
     * Sanitizes raw QR values (handles direct strings, JSON payloads, or URLs)
     */
    private fun sanitizeAssetTag(raw: String): String {
        val trimmed = raw.trim()
        return when {
            trimmed.contains("GITAM-BUS-", ignoreCase = true) -> {
                val match = Regex("GITAM-BUS-\\d{2}", RegexOption.IGNORE_CASE).find(trimmed)
                match?.value?.uppercase() ?: trimmed.uppercase()
            }
            trimmed.startsWith("BUS-", ignoreCase = true) -> {
                "GITAM-${trimmed.uppercase()}"
            }
            else -> trimmed.uppercase()
        }
    }

    private fun onSuccessfulScan(assetTag: String) {
        // Haptic Feedback Confirmation
        binding.root.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
        val vibrator = getSystemService(VIBRATOR_SERVICE) as? Vibrator
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            vibrator?.vibrate(VibrationEffect.createOneShot(120, VibrationEffect.DEFAULT_AMPLITUDE))
        }

        Toast.makeText(this, "Vehicle Paired: $assetTag", Toast.LENGTH_SHORT).show()

        val resultIntent = Intent().apply {
            putExtra(EXTRA_ASSET_TAG, assetTag)
        }
        setResult(RESULT_OK, resultIntent)
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        laserAnimator?.cancel()
        cameraExecutor.shutdown()
        barcodeScanner?.close()
    }
}
