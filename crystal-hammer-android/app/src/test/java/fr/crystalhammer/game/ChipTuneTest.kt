package fr.crystalhammer.game

import org.junit.Assert.assertTrue
import org.junit.Test

class ChipTuneTest {
    @Test
    fun `genere une boucle musicale originale complete et non silencieuse`() {
        val samples = ChipTune.compose(8_000)
        assertTrue(samples.size == 64_000)
        assertTrue(samples.any { it != 0.toShort() })
        assertTrue(samples.maxOf { kotlin.math.abs(it.toInt()) } < Short.MAX_VALUE)
    }
}
