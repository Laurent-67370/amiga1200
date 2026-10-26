package fr.crystalhammer.game

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HighScoresTest {
    @Test
    fun `un score est qualifie tant que le top 20 est incomplet`() {
        assertTrue(HighScoreLeaderboard.qualifies(emptyList(), 100))
        assertFalse(HighScoreLeaderboard.qualifies(emptyList(), 0))
    }

    @Test
    fun `les scores sont tries et limites a vingt`() {
        var entries = emptyList<HighScoreEntry>()
        for (score in 1..25) {
            entries = HighScoreLeaderboard.insert(entries, "J$score", score)
        }
        assertEquals(20, entries.size)
        assertEquals((25 downTo 6).toList(), entries.map { it.score })
        assertFalse(HighScoreLeaderboard.qualifies(entries, 5))
        assertTrue(HighScoreLeaderboard.qualifies(entries, 15))
    }

    @Test
    fun `le nom est nettoye et limite`() {
        val entries = HighScoreLeaderboard.insert(emptyList(), "  ABCDEFGHIJKLMNOP  ", 100)
        assertEquals("ABC", entries.single().name)
    }

    @Test
    fun `la serialisation conserve les accents et separateurs`() {
        val original = listOf(
            HighScoreEntry("É;|", 1200),
            HighScoreEntry("Øyv", 800)
        )
        assertEquals(original, HighScoreCodec.decode(HighScoreCodec.encode(original)))
    }

    @Test
    fun `les donnees invalides sont ignorees`() {
        val decoded = HighScoreCodec.decode("abc|X;100|OK;-2|BAD;300|")
        assertEquals(listOf(HighScoreEntry("OK", 100)), decoded)
    }
}
