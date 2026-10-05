package com.tracer.fleettracker.ui

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.util.AttributeSet
import android.view.View
import android.view.animation.LinearInterpolator
import androidx.core.content.ContextCompat
import com.tracer.fleettracker.R

/**
 * Animated High-Contrast Concentric Radar HUD Component.
 * Radiates glowing pulsing waves outward when shift transponder is active.
 */
class RadarPulseView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val wavePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 3f * resources.displayMetrics.density
    }

    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }

    private val centerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = ContextCompat.getColor(context, R.color.amber_electric)
    }

    private val centerBorderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 3f * resources.displayMetrics.density
        color = ContextCompat.getColor(context, R.color.white)
    }

    private var animator: ValueAnimator? = null
    private var isPulseActive = false
    private var animFraction = 0f

    private val pulseColor = ContextCompat.getColor(context, R.color.amber_electric)

    init {
        wavePaint.color = pulseColor
        fillPaint.color = pulseColor
    }

    fun setPulsing(active: Boolean) {
        if (isPulseActive == active) return
        isPulseActive = active

        if (active) {
            animator = ValueAnimator.ofFloat(0f, 1f).apply {
                duration = 2400
                repeatCount = ValueAnimator.INFINITE
                interpolator = LinearInterpolator()
                addUpdateListener {
                    animFraction = it.animatedValue as Float
                    invalidate()
                }
                start()
            }
        } else {
            animator?.cancel()
            animator = null
            animFraction = 0f
            invalidate()
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val cx = width / 2f
        val cy = height / 2f
        val maxRadius = (width.coerceAtMost(height) / 2f) * 0.95f
        val coreRadius = 22f * resources.displayMetrics.density

        if (isPulseActive) {
            // Draw 2 phase-shifted expanding radar rings
            val waveCount = 2
            for (i in 0 until waveCount) {
                val phase = (animFraction + (i.toFloat() / waveCount)) % 1f
                val currentRadius = coreRadius + (maxRadius - coreRadius) * phase
                val alpha = ((1f - phase) * 220).toInt().coerceIn(0, 255)

                wavePaint.alpha = alpha
                fillPaint.alpha = (alpha * 0.15f).toInt()

                canvas.drawCircle(cx, cy, currentRadius, fillPaint)
                canvas.drawCircle(cx, cy, currentRadius, wavePaint)
            }
        }

        // Draw Center Transponder Core
        canvas.drawCircle(cx, cy, coreRadius, centerPaint)
        canvas.drawCircle(cx, cy, coreRadius, centerBorderPaint)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        animator?.cancel()
    }
}
