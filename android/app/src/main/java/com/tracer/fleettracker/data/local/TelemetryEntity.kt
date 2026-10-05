package com.tracer.fleettracker.data.local

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import org.json.JSONObject

/**
 * Room SQLite Entity for local telemetry caching (Store-and-Forward pattern).
 * Guarantees zero data loss when traveling through cellular dead-zones.
 */
@Entity(tableName = "telemetry_cache")
data class TelemetryEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,

    @ColumnInfo(name = "asset_id")
    val assetId: String,

    @ColumnInfo(name = "latitude")
    val latitude: Double,

    @ColumnInfo(name = "longitude")
    val longitude: Double,

    @ColumnInfo(name = "altitude")
    val altitude: Double? = null,

    @ColumnInfo(name = "speed")
    val speed: Double = 0.0,

    @ColumnInfo(name = "heading")
    val heading: Double? = null,

    @ColumnInfo(name = "battery_level")
    val batteryLevel: Int? = null,

    @ColumnInfo(name = "recorded_at")
    val recordedAt: String,

    @ColumnInfo(name = "session_id")
    val sessionId: String? = null,

    @ColumnInfo(name = "synced")
    val synced: Boolean = false
) {
    /**
     * Converts Entity to matching JSON Object for Node.js POST /api/telemetry contract.
     */
    fun toJson(): JSONObject {
        return JSONObject().apply {
            put("asset_id", assetId)
            put("latitude", latitude)
            put("longitude", longitude)
            if (altitude != null) put("altitude", altitude)
            put("speed", speed)
            if (heading != null) put("heading", heading)
            if (batteryLevel != null) put("battery_level", batteryLevel)
            put("recorded_at", recordedAt)
            if (sessionId != null) put("session_id", sessionId)
        }
    }
}
