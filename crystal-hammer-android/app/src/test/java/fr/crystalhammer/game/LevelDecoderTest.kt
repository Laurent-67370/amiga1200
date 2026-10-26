package fr.crystalhammer.game

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LevelDecoderTest {
    private fun emptyLevels() = ByteArray(LevelDecoder.LEVEL_COUNT * LevelDecoder.BYTES_PER_LEVEL)

    @Test
    fun `decode la couleur et la resistance`() {
        val data = emptyLevels()
        data[0] = 0x52
        val brick = LevelDecoder.decode(data, 1)[0]
        assertEquals(5, brick.color)
        assertEquals(2, brick.maxHits)
        assertEquals(2, brick.hits)
    }

    @Test
    fun `reconnait les blocs solides`() {
        val data = emptyLevels()
        data[399] = 0xFF.toByte()
        val brick = LevelDecoder.decode(data, 1)[399]
        assertTrue(brick.solid)
        assertEquals(1, brick.hits)
    }

    @Test
    fun `selectionne le bon niveau`() {
        val data = emptyLevels()
        data[30 * 400 - 1] = 0x71
        val brick = LevelDecoder.decode(data, 30)[399]
        assertEquals(7, brick.color)
        assertEquals(1, brick.hits)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `refuse un fichier tronque`() {
        LevelDecoder.decode(ByteArray(12), 1)
    }
}
