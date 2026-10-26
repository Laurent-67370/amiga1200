package fr.crystalhammer.game

import android.content.Context
import java.net.URLDecoder
import java.net.URLEncoder

internal data class HighScoreEntry(val name: String, val score: Int)

internal object HighScoreLeaderboard {
    const val MAX_ENTRIES = 20
    const val MAX_NAME_LENGTH = 3

    fun qualifies(entries: List<HighScoreEntry>, score: Int): Boolean =
        score > 0 && (entries.size < MAX_ENTRIES || score > entries.last().score)

    fun insert(entries: List<HighScoreEntry>, name: String, score: Int): List<HighScoreEntry> {
        val cleanName = name.trim().take(MAX_NAME_LENGTH)
        if (cleanName.isEmpty() || score <= 0) return entries
        return (entries + HighScoreEntry(cleanName, score))
            .sortedWith(compareByDescending<HighScoreEntry> { it.score }.thenBy { it.name })
            .take(MAX_ENTRIES)
    }
}

/** Format lisible et sans dépendance : score|nom encodé;score|nom encodé. */
internal object HighScoreCodec {
    fun encode(entries: List<HighScoreEntry>): String = entries.joinToString(";") { entry ->
        "${entry.score}|${URLEncoder.encode(entry.name, "UTF-8")}"
    }

    fun decode(raw: String?): List<HighScoreEntry> {
        if (raw.isNullOrBlank()) return emptyList()
        return raw.split(';').mapNotNull { item ->
            val separator = item.indexOf('|')
            if (separator <= 0) return@mapNotNull null
            val score = item.substring(0, separator).toIntOrNull() ?: return@mapNotNull null
            val name = runCatching {
                URLDecoder.decode(item.substring(separator + 1), "UTF-8")
            }.getOrNull()?.trim()?.take(HighScoreLeaderboard.MAX_NAME_LENGTH)
            if (name.isNullOrEmpty() || score <= 0) null else HighScoreEntry(name, score)
        }.sortedByDescending { it.score }.take(HighScoreLeaderboard.MAX_ENTRIES)
    }
}

internal class HighScoreStore(context: Context) {
    private val preferences = context.getSharedPreferences("crystal_hammer", Context.MODE_PRIVATE)

    val lastName: String
        get() = preferences.getString("player_name", "") ?: ""

    fun entries(): List<HighScoreEntry> =
        HighScoreCodec.decode(preferences.getString("high_scores_v1", null))

    fun add(name: String, score: Int): List<HighScoreEntry> {
        val updated = HighScoreLeaderboard.insert(entries(), name, score)
        preferences.edit()
            .putString("high_scores_v1", HighScoreCodec.encode(updated))
            .putString("player_name", name.trim().take(HighScoreLeaderboard.MAX_NAME_LENGTH))
            .apply()
        return updated
    }
}
