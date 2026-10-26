package fr.crystalhammer.game

import org.junit.Assert.assertEquals
import org.junit.Test

class RunStatsTest {
    @Test
    fun `conserve la meilleure serie apres une remise a zero`() {
        val stats = RunStats()
        repeat(4) { stats.brickDestroyed() }
        stats.resetCombo()
        repeat(2) { stats.brickDestroyed() }
        assertEquals(6, stats.bricksDestroyed)
        assertEquals(4, stats.bestCombo)
        assertEquals(2, stats.currentCombo)
    }

    @Test
    fun `calcule la precision laser sans division par zero`() {
        val stats = RunStats()
        assertEquals(0, stats.laserPrecision)
        stats.laserShots = 8
        stats.laserHits = 5
        assertEquals(62, stats.laserPrecision)
    }
}
