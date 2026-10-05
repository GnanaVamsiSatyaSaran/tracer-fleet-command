package com.tracer.fleettracker.data.remote

import android.content.Context
import android.util.Log
import com.tracer.fleettracker.data.local.TelemetryDao
import com.tracer.fleettracker.data.local.TelemetryEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * Robust HTTP Telemetry Dispatcher using Store-and-Forward architecture.
 * Dispatches coordinates directly to the Fleet Command Node.js backend.
 */
class TelemetryUploader(private val context: Context) {

    companion object {
        private const val TAG = "TelemetryUploader"
        const val DEFAULT_SERVER_URL = "https://fleet-command-api.onrender.com/api/telemetry"
        const val LOCAL_SERVER_URL = "http://172.19.205.20:3000/api/telemetry"
        private const val CONNECT_TIMEOUT_MS = 6000
        private const val READ_TIMEOUT_MS = 8000
    }

    /**
     * Attempts to immediately upload a batch of telemetry entities.
     * @return true if HTTP 200/201 received, false otherwise.
     */
    suspend fun uploadBatch(
        endpointUrl: String,
        records: List<TelemetryEntity>
    ): Boolean = withContext(Dispatchers.IO) {
        if (records.isEmpty()) return@withContext true

        var connection: HttpURLConnection? = null
        try {
            val jsonArray = JSONArray()
            records.forEach { jsonArray.put(it.toJson()) }

            val url = URL(endpointUrl)
            connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                doOutput = true
                doInput = true
                setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                setRequestProperty("Accept", "application/json")
            }

            OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
                writer.write(jsonArray.toString())
                writer.flush()
            }

            val responseCode = connection.responseCode
            val isSuccess = responseCode in 200..299

            if (isSuccess) {
                val responseBody = connection.inputStream.bufferedReader().use { it.readText() }
                Log.d(TAG, "Uploaded ${records.size} telemetry points. Response [$responseCode]: $responseBody")
            } else {
                val errorBody = connection.errorStream?.bufferedReader()?.use { it.readText() }
                Log.w(TAG, "Server rejected telemetry batch [$responseCode]: $errorBody")
            }

            return@withContext isSuccess
        } catch (e: Exception) {
            Log.w(TAG, "Telemetry upload deferred (offline or network failure): ${e.localizedMessage}")
            return@withContext false
        } finally {
            connection?.disconnect()
        }
    }

    /**
     * Flushes unsynced SQLite records in batches of 50.
     * Marks synced records and purges old ones to keep SQLite database lean.
     */
    suspend fun flushOfflineQueue(
        dao: TelemetryDao,
        endpointUrl: String
    ): Int = withContext(Dispatchers.IO) {
        var totalUploaded = 0
        while (true) {
            val pendingBatch = dao.getUnsyncedBatch(limit = 50)
            if (pendingBatch.isEmpty()) break

            val success = uploadBatch(endpointUrl, pendingBatch)
            if (success) {
                val syncedIds = pendingBatch.map { it.id }
                dao.markAsSynced(syncedIds)
                dao.purgeSyncedRecords()
                totalUploaded += pendingBatch.size
            } else {
                // Network unreachable; cease flushing and wait for next network event
                break
            }
        }
        return@withContext totalUploaded
    }
}
