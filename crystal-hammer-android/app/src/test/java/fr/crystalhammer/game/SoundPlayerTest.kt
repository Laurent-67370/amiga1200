package fr.crystalhammer.game

import org.junit.Assert.assertEquals
import org.junit.Test

class SoundPlayerTest {
    @Test
    fun `un echec audio ne provoque pas de plantage`() {
        val sound = SoundPlayer { _: Float -> throw RuntimeException("Init failed") }
        sound.play(GameEvent.BRICK)
        sound.release()
    }

    @Test
    fun `audio desactive apres le premier echec`() {
        var attempts = 0
        val sound = SoundPlayer { _: Float ->
            attempts++
            throw RuntimeException("Init failed")
        }
        GameEvent.values().forEach(sound::play)
        assertEquals(1, attempts)
    }

    @Test
    fun `un echec de lecture coupe les effets sans plantage`() {
        var plays = 0
        val sound = SoundPlayer { _: Float ->
            object : EffectBank {
                override fun play(event: GameEvent) {
                    plays++
                    throw RuntimeException("Driver lost")
                }
                override fun release() = Unit
            }
        }
        GameEvent.values().forEach(sound::play)
        assertEquals(1, plays)
    }

    @Test
    fun `le volume nul ne cree aucune banque`() {
        var created = 0
        val sound = SoundPlayer { _: Float ->
            created++
            object : EffectBank {
                override fun play(event: GameEvent) = Unit
                override fun release() = Unit
            }
        }
        sound.setEffectsVolume(0)
        sound.play(GameEvent.PADDLE)
        assertEquals(0, created)
        sound.setEffectsVolume(50)
        sound.play(GameEvent.PADDLE)
        sound.play(GameEvent.BRICK)
        assertEquals(1, created)
    }
}
