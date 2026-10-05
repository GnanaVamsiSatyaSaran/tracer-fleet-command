package com.tracer.fleettracker.ui

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.util.AttributeSet
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.tracer.fleettracker.R

/**
 * Enterprise Swipe-to-Confirm Slider Component.
 * Eliminates accidental driver shift activation while operating moving vehicles.
 */
class SwipeSliderView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr) {

    private val trackView: View
    private val hintTextView: TextView
    private val thumbView: ImageView

    private var isShiftActive: Boolean = false
    private var isDragging: Boolean = false
    private var initialTouchX: Float = 0f
    private var currentThumbX: Float = 0f
    private var maxDragDistance: Float = 0f

    var onSwipeCompleteListener: (() -> Unit)? = null

    init {
        // Build Track Layout
        trackView = View(context).apply {
            background = ContextCompat.getDrawable(context, R.drawable.bg_slider_track)
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        }
        addView(trackView)

        // Center Action Hint Label
        hintTextView = TextView(context).apply {
            text = ">>> SWIPE TO START SHIFT >>>"
            setTextColor(ContextCompat.getColor(context, R.color.amber_electric))
            textSize = 13f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            letterSpacing = 0.08f
            gravity = android.view.Gravity.CENTER
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        }
        addView(hintTextView)

        // Draggable Thumb Handle
        thumbView = ImageView(context).apply {
            val sizePx = (52 * resources.displayMetrics.density).toInt()
            layoutParams = LayoutParams(sizePx, sizePx).apply {
                gravity = android.view.Gravity.CENTER_VERTICAL
                marginStart = (6 * resources.displayMetrics.density).toInt()
            }
            background = ContextCompat.getDrawable(context, R.drawable.bg_slider_thumb)
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            setImageResource(android.R.drawable.ic_media_play)
            setColorFilter(ContextCompat.getColor(context, R.color.obsidian_bg))
            elevation = 8f * resources.displayMetrics.density
        }
        addView(thumbView)
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        val margin = 6 * resources.displayMetrics.density
        maxDragDistance = (w - thumbView.width - (margin * 2)).coerceAtLeast(0f)
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.action) {
            MotionEvent.ACTION_DOWN -> {
                // Ensure touch starts near current thumb position
                val thumbLeft = thumbView.x
                val thumbRight = thumbLeft + thumbView.width
                if (event.x in (thumbLeft - 40f)..(thumbRight + 40f)) {
                    isDragging = true
                    initialTouchX = event.rawX - thumbView.translationX
                    parent?.requestDisallowInterceptTouchEvent(true)
                    return true
                }
            }
            MotionEvent.ACTION_MOVE -> {
                if (isDragging) {
                    val newX = (event.rawX - initialTouchX).coerceIn(0f, maxDragDistance)
                    currentThumbX = newX
                    thumbView.translationX = newX

                    // Fade out hint text proportionally
                    val progress = if (maxDragDistance > 0) newX / maxDragDistance else 0f
                    hintTextView.alpha = (1f - (progress * 1.5f)).coerceAtLeast(0f)
                    return true
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                if (isDragging) {
                    isDragging = false
                    parent?.requestDisallowInterceptTouchEvent(false)
                    val progress = if (maxDragDistance > 0) currentThumbX / maxDragDistance else 0f

                    if (progress >= 0.80f) {
                        // Complete Swipe Confirmation
                        performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                        snapTo(maxDragDistance) {
                            onSwipeCompleteListener?.invoke()
                            resetThumb(animated = true)
                        }
                    } else {
                        // Spring Snap-Back
                        resetThumb(animated = true)
                    }
                    return true
                }
            }
        }
        return super.onTouchEvent(event)
    }

    private fun snapTo(targetX: Float, onEnd: (() -> Unit)? = null) {
        ValueAnimator.ofFloat(thumbView.translationX, targetX).apply {
            duration = 150
            interpolator = DecelerateInterpolator()
            addUpdateListener { anim ->
                thumbView.translationX = anim.animatedValue as Float
            }
            addListener(object : android.animation.AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: android.animation.Animator) {
                    onEnd?.invoke()
                }
            })
            start()
        }
    }

    fun resetThumb(animated: Boolean = true) {
        currentThumbX = 0f
        if (animated) {
            ValueAnimator.ofFloat(thumbView.translationX, 0f).apply {
                duration = 220
                interpolator = DecelerateInterpolator()
                addUpdateListener { anim ->
                    thumbView.translationX = anim.animatedValue as Float
                    val progress = if (maxDragDistance > 0) (anim.animatedValue as Float) / maxDragDistance else 0f
                    hintTextView.alpha = (1f - (progress * 1.5f)).coerceIn(0f, 1f)
                }
                start()
            }
        } else {
            thumbView.translationX = 0f
            hintTextView.alpha = 1f
        }
    }

    fun setShiftActive(active: Boolean) {
        isShiftActive = active
        if (active) {
            hintTextView.text = "<<< SWIPE TO END SHIFT <<<"
            hintTextView.setTextColor(ContextCompat.getColor(context, R.color.crimson_stop))
            thumbView.setImageResource(android.R.drawable.ic_delete)
            thumbView.backgroundTintList = android.content.res.ColorStateList.valueOf(
                ContextCompat.getColor(context, R.color.crimson_stop)
            )
        } else {
            hintTextView.text = ">>> SWIPE TO START SHIFT >>>"
            hintTextView.setTextColor(ContextCompat.getColor(context, R.color.amber_electric))
            thumbView.setImageResource(android.R.drawable.ic_media_play)
            thumbView.backgroundTintList = null
        }
        resetThumb(animated = false)
    }
}
