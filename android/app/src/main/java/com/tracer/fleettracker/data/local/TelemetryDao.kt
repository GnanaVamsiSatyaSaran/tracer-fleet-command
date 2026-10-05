package com.tracer.fleettracker.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

/**
 * Data Access Object (DAO) for Store-and-Forward Telemetry operations.
 */
@Dao
interface TelemetryDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(telemetry: TelemetryEntity): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(telemetries: List<TelemetryEntity>)

    @Query("SELECT * FROM telemetry_cache WHERE synced = 0 ORDER BY id ASC LIMIT :limit")
    suspend fun getUnsyncedBatch(limit: Int = 50): List<TelemetryEntity>

    @Query("SELECT COUNT(*) FROM telemetry_cache WHERE synced = 0")
    suspend fun getUnsyncedCount(): Int

    @Query("SELECT COUNT(*) FROM telemetry_cache WHERE synced = 0")
    fun observeUnsyncedCount(): Flow<Int>

    @Query("UPDATE telemetry_cache SET synced = 1 WHERE id IN (:ids)")
    suspend fun markAsSynced(ids: List<Long>)

    @Query("DELETE FROM telemetry_cache WHERE synced = 1")
    suspend fun purgeSyncedRecords(): Int

    @Query("DELETE FROM telemetry_cache")
    suspend fun clearAll()
}
