package fr.crystalhammer.game

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.util.Log
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.pow
import kotlin.math.sin

/** Banque d'effets : une implémentation par plateforme, remplaçable dans les tests. */
internal interface EffectBank {
    fun play(event: GameEvent)
    fun release()
}

/** Effets et musique sont paresseux : aucun échec audio ne peut empêcher le jeu de démarrer. */
internal class SoundPlayer(
    private val effectFactory: (Float) -> EffectBank = { volume -> AudioTrackEffectBank(volume) }
) {
    private var effects: EffectBank? = null
    private var effectsDisabled = false
    private var effectsVolume = 70
    private var music: AudioTrack? = null
    private var musicDisabled = false
    private var musicRequested = false
    private var musicVolume = 35

    fun play(event: GameEvent) {
        if (effectsVolume <= 0) return
        val bank = getEffects() ?: return
        try {
            bank.play(event)
        } catch (error: RuntimeException) {
            disableEffects("Lecture audio impossible", error)
        }
    }

    fun setEffectsVolume(volume: Int) {
        val newVolume = volume.coerceIn(0, 100)
        if (newVolume == effectsVolume) return
        effectsVolume = newVolume
        releaseEffects()
    }

    fun setMusicVolume(volume: Int) {
        musicVolume = volume.coerceIn(0, 100)
        try {
            music?.setVolume(musicVolume / 100f * 0.55f)
            if (musicVolume == 0) music?.pause() else if (musicRequested) startMusic()
        } catch (error: RuntimeException) {
            disableMusic("Réglage musical impossible", error)
        }
    }

    fun startMusic() {
        musicRequested = true
        if (musicVolume <= 0 || musicDisabled) return
        try {
            val track = music ?: createMusicTrack().also { music = it }
            track.setVolume(musicVolume / 100f * 0.55f)
            if (track.playState != AudioTrack.PLAYSTATE_PLAYING) track.play()
        } catch (error: RuntimeException) {
            disableMusic("Musique indisponible", error)
        }
    }

    fun pauseMusic() {
        try {
            music?.pause()
        } catch (error: RuntimeException) {
            disableMusic("Pause musicale impossible", error)
        }
    }

    fun resumeMusic() {
        if (musicRequested) startMusic()
    }

    private fun getEffects(): EffectBank? {
        if (effectsDisabled) return null
        return try {
            effects ?: effectFactory(effectsVolume / 100f * 0.8f).also { effects = it }
        } catch (error: RuntimeException) {
            disableEffects("Initialisation audio impossible", error)
            null
        }
    }

    private fun createMusicTrack(): AudioTrack {
        val sampleRate = 22_050
        val samples = ChipTune.compose(sampleRate)
        val track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_GAME)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(sampleRate)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setTransferMode(AudioTrack.MODE_STATIC)
            .setBufferSizeInBytes(samples.size * 2)
            .build()
        val written = track.write(samples, 0, samples.size)
        if (written != samples.size) {
            track.release()
            throw IllegalStateException("Écriture musicale incomplète")
        }
        track.setLoopPoints(0, samples.size, -1)
        return track
    }

    private fun disableEffects(message: String, error: RuntimeException) {
        effectsDisabled = true
        Log.e("CrystalHammer", message + "; le jeu continue sans effets sonores", error)
        releaseEffects()
    }

    private fun disableMusic(message: String, error: RuntimeException) {
        musicDisabled = true
        Log.e("CrystalHammer", message + "; le jeu continue sans musique", error)
        releaseMusic()
    }

    private fun releaseEffects() {
        try {
            effects?.release()
        } catch (_: RuntimeException) {
            // Certains pilotes audio peuvent aussi échouer pendant la libération.
        }
        effects = null
    }

    private fun releaseMusic() {
        try {
            music?.release()
        } catch (_: RuntimeException) {
            // La fermeture du jeu ne doit pas échouer à cause de l'audio.
        }
        music = null
    }

    fun release() {
        releaseEffects()
        releaseMusic()
        effectsDisabled = true
        musicDisabled = true
        musicRequested = false
    }
}

/**
 * Une piste statique par effet, créée au premier usage. Relancer un effet coupe
 * simplement sa lecture précédente, ce qui suffit pour des sons de moins d'une demi-seconde.
 */
internal class AudioTrackEffectBank(private val volume: Float) : EffectBank {
    private val tracks = HashMap<GameEvent, AudioTrack>()

    override fun play(event: GameEvent) {
        val track = tracks.getOrPut(event) { createTrack(SoundEffects.synthesize(event, SAMPLE_RATE)) }
        if (track.playState == AudioTrack.PLAYSTATE_PLAYING) track.stop()
        track.playbackHeadPosition = 0
        track.play()
    }

    private fun createTrack(samples: ShortArray): AudioTrack {
        val track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_GAME)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setTransferMode(AudioTrack.MODE_STATIC)
            .setBufferSizeInBytes(samples.size * 2)
            .build()
        if (track.write(samples, 0, samples.size) != samples.size) {
            track.release()
            throw IllegalStateException("Écriture d'effet incomplète")
        }
        track.setVolume(volume)
        return track
    }

    override fun release() {
        tracks.values.forEach { track ->
            try {
                track.release()
            } catch (_: RuntimeException) {
                // La libération d'une piste ne doit jamais bloquer les suivantes.
            }
        }
        tracks.clear()
    }

    private companion object {
        const val SAMPLE_RATE = 22_050
    }
}

/** Effets courts synthétisés : glissandos carrés, arpèges et bruit, dans l'esprit des puces Paula. */
internal object SoundEffects {
    private class Voice(
        val start: Double,
        val duration: Double,
        val fromHz: Double,
        val toHz: Double,
        val gain: Double,
        val duty: Double = 0.5,
        val noise: Boolean = false
    )

    private fun voices(event: GameEvent): List<Voice> = when (event) {
        GameEvent.PADDLE -> listOf(Voice(0.0, 0.07, 330.0, 250.0, 0.55, duty = 0.35))
        GameEvent.BRICK -> listOf(
            Voice(0.0, 0.09, 1320.0, 1760.0, 0.42, duty = 0.25),
            Voice(0.0, 0.03, 0.0, 0.0, 0.18, noise = true)
        )
        GameEvent.HARD_BRICK -> listOf(
            Voice(0.0, 0.08, 520.0, 470.0, 0.45, duty = 0.5),
            Voice(0.0, 0.05, 0.0, 0.0, 0.22, noise = true)
        )
        GameEvent.POWER -> arpeggio(doubleArrayOf(523.25, 659.25, 783.99, 1046.5), 0.05, 0.42)
        GameEvent.EXTRA_LIFE -> arpeggio(doubleArrayOf(392.0, 523.25, 659.25, 783.99, 1046.5, 1318.5), 0.06, 0.42)
        GameEvent.LASER -> listOf(Voice(0.0, 0.11, 1900.0, 520.0, 0.32, duty = 0.2))
        GameEvent.LOST -> listOf(
            Voice(0.0, 0.48, 440.0, 70.0, 0.5, duty = 0.5),
            Voice(0.0, 0.25, 0.0, 0.0, 0.16, noise = true)
        )
        GameEvent.LEVEL -> arpeggio(doubleArrayOf(523.25, 659.25, 783.99, 659.25, 783.99, 1046.5), 0.075, 0.4)
        GameEvent.WORM -> listOf(
            Voice(0.0, 0.16, 180.0, 900.0, 0.4, duty = 0.3),
            Voice(0.0, 0.12, 0.0, 0.0, 0.2, noise = true)
        )
    }

    private fun arpeggio(notes: DoubleArray, step: Double, gain: Double) = notes.mapIndexed { index, hz ->
        Voice(index * step, step * 1.6, hz, hz, gain, duty = 0.5)
    }

    fun synthesize(event: GameEvent, sampleRate: Int): ShortArray {
        require(sampleRate >= 8_000)
        val parts = voices(event)
        val length = parts.maxOf { it.start + it.duration }
        val result = ShortArray((length * sampleRate).toInt() + 1)
        var noise = 0x2468ACE
        for (voice in parts) {
            val first = (voice.start * sampleRate).toInt()
            val count = (voice.duration * sampleRate).toInt()
            var phase = 0.0
            for (offset in 0 until count) {
                val index = first + offset
                if (index >= result.size) break
                val progress = offset.toDouble() / count
                // Attaque de 2 ms puis décroissance exponentielle, pour éviter tout claquement.
                val attack = (offset / (0.002 * sampleRate)).coerceAtMost(1.0)
                val envelope = attack * exp(-3.2 * progress) * (1.0 - progress)
                val sample = if (voice.noise) {
                    noise = noise * 1103515245 + 12345
                    ((noise ushr 16) and 0x7FFF) / 16_383.5 - 1.0
                } else {
                    val hz = voice.fromHz + (voice.toHz - voice.fromHz) * progress
                    phase = (phase + hz / sampleRate) % 1.0
                    if (phase < voice.duty) 1.0 else -1.0
                }
                val mixed = result[index] / 32_767.0 + sample * envelope * voice.gain * 0.6
                result[index] = floor(mixed.coerceIn(-1.0, 1.0) * 32_767.0).toInt().toShort()
            }
        }
        return result
    }
}

/** Petite boucle originale de huit secondes : voix carrée, basse triangulaire et percussion. */
internal object ChipTune {
    private val melody = intArrayOf(
        12, 19, 24, 19, 15, 22, 24, 27, 12, 19, 24, 28, 27, 24, 22, 19,
        10, 17, 22, 17, 14, 21, 22, 26, 10, 17, 22, 25, 24, 22, 21, 17,
        8, 15, 20, 15, 12, 19, 20, 24, 8, 15, 20, 23, 22, 20, 19, 15,
        7, 14, 19, 14, 11, 18, 19, 23, 12, 15, 19, 24, 23, 19, 18, 14
    )
    private val bassRoots = intArrayOf(0, 0, -2, -2, -4, -4, -5, -5)

    fun compose(sampleRate: Int): ShortArray {
        require(sampleRate >= 8_000)
        val result = ShortArray(sampleRate * 8)
        val stepDuration = 0.125
        val leadFrequencies = DoubleArray(melody.size) { 220.0 * 2.0.pow(melody[it] / 12.0) }
        val bassFrequencies = DoubleArray(bassRoots.size) { 110.0 * 2.0.pow(bassRoots[it] / 12.0) }
        var noise = 0x1357
        for (index in result.indices) {
            val time = index.toDouble() / sampleRate
            val step = (time / stepDuration).toInt() % melody.size
            val withinStep = time % stepDuration
            val envelope = when {
                withinStep < 0.008 -> withinStep / 0.008
                withinStep > 0.105 -> ((0.125 - withinStep) / 0.020).coerceIn(0.0, 1.0)
                else -> 1.0
            }
            val leadFrequency = leadFrequencies[step]
            val leadPhase = (time * leadFrequency) % 1.0
            val lead = if (leadPhase < 0.25) 1.0 else -0.65
            val bassFrequency = bassFrequencies[(step / 8) % bassRoots.size]
            val bassPhase = (time * bassFrequency) % 1.0
            val bass = 1.0 - 4.0 * abs(bassPhase - 0.5)
            noise = noise * 1103515245 + 12345
            val percussion = if (step % 2 == 0 && withinStep < 0.025) {
                ((noise ushr 16) % 2000 - 1000) / 1000.0 * (1.0 - withinStep / 0.025)
            } else 0.0
            val mixed = (lead * envelope * 0.24 + bass * 0.15 + percussion * 0.07)
                .coerceIn(-1.0, 1.0)
            result[index] = floor(mixed * Short.MAX_VALUE).toInt().toShort()
        }
        return result
    }
}
