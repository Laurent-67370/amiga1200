package fr.crystalhammer.game

import android.content.Context

/**
 * Décode les 30 écrans de 20 × 20 cellules du fichier fourni.
 * Le quartet haut contient la couleur, le quartet bas le nombre de coups.
 * 255 désigne un bloc indestructible et 0 une case vide.
 */
internal object LevelDecoder {
    const val LEVEL_COUNT = 30
    const val BYTES_PER_LEVEL = GameEngine.ROWS * GameEngine.COLS

    fun decode(data: ByteArray, oneBasedLevel: Int): Array<Brick> {
        require(data.size == LEVEL_COUNT * BYTES_PER_LEVEL) {
            "Le fichier doit contenir exactement ${LEVEL_COUNT * BYTES_PER_LEVEL} octets."
        }
        require(oneBasedLevel in 1..LEVEL_COUNT) { "Niveau invalide : $oneBasedLevel" }
        val offset = (oneBasedLevel - 1) * BYTES_PER_LEVEL
        return Array(BYTES_PER_LEVEL) { index ->
            val value = data[offset + index].toInt() and 0xFF
            when {
                value == 0 -> Brick(0, 0, 0)
                value == 255 -> Brick(0, 1, 1, solid = true)
                else -> {
                    val color = value ushr 4
                    val hits = value and 0x0F
                    require(color in 1..7 && hits > 0) { "Cellule invalide : $value" }
                    Brick(color, hits, hits)
                }
            }
        }
    }

    fun fromAssets(context: Context, oneBasedLevel: Int): Array<Brick> {
        val data = context.assets.open("levels.bin").use { it.readBytes() }
        return decode(data, oneBasedLevel)
    }
}
