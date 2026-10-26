package fr.crystalhammer.game

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class SoundEffectsTest {
    @Test
    fun `chaque evenement a un effet court audible et sans saturation`() {
        for (event in GameEvent.values()) {
            val samples = SoundEffects.synthesize(event, 22_050)
            assertTrue("$event trop long", samples.size < 22_050)
            assertTrue("$event silencieux", samples.any { abs(it.toInt()) > 2_000 })
            assertTrue("$event sature", samples.maxOf { abs(it.toInt()) } < Short.MAX_VALUE)
        }
    }

    @Test
    fun `les effets commencent et finissent sans claquement`() {
        for (event in GameEvent.values()) {
            val samples = SoundEffects.synthesize(event, 22_050)
            assertTrue("$event démarre trop fort", abs(samples.first().toInt()) < 1_000)
            assertTrue("$event s'arrête trop fort", abs(samples.last().toInt()) < 1_000)
        }
    }

    @Test
    fun `les effets sont distincts`() {
        val signatures = GameEvent.values().map { SoundEffects.synthesize(it, 22_050).toList() }.toSet()
        assertEquals(GameEvent.values().size, signatures.size)
    }
}
