package fr.crystalhammer.game

import org.junit.Assert.assertEquals
import org.junit.Test

class SoundPlayerTest {
    @Test
    fun `un echec audio ne provoque pas de plantage`() {
        val sound = SoundPlayer { _: Int -> throw RuntimeException("Init failed") }
        sound.play(GameEvent.BRICK)
        sound.release()
    }

    @Test
    fun `audio desactive apres le premier echec`() {
        var attempts = 0
        val sound = SoundPlayer { _: Int ->
            attempts++
            throw RuntimeException("Init failed")
        }
        GameEvent.values().forEach(sound::play)
        assertEquals(1, attempts)
    }
}
