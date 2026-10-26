package fr.crystalhammer.game

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class LevelArchiveTest {
    @Test
    fun `verifie les 30 tableaux originaux et leurs cases destructibles`() {
        val archive = listOf(
            File("src/main/assets/levels.bin"),
            File("app/src/main/assets/levels.bin")
        ).first { it.isFile }
        val data = archive.readBytes()
        assertEquals(12_000, data.size)
        for (level in 1..LevelDecoder.LEVEL_COUNT) {
            val bricks = LevelDecoder.decode(data, level)
            assertEquals(400, bricks.size)
            assertTrue("Le tableau $level ne contient aucun objectif", bricks.any { !it.solid && it.hits > 0 })
        }
    }
}
