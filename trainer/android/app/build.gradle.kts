import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Numéro de version : celui de la compilation GitHub Actions (1 en local)
val build = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()

// La page du Trainer, construite par « npm run build » dans trainer/ (dossier dist), devient les fichiers de l'APK
val page = file("../../dist")

android {
    namespace = "io.github.laurent67370.trainer68k"
    compileSdk = 35
    defaultConfig {
        applicationId = "io.github.laurent67370.trainer68k"
        minSdk = 26
        targetSdk = 35
        versionCode = build
        versionName = "1.0.$build"
    }
    // Clé de test publique (debug.keystore, mots de passe « android ») : chaque nouvel APK s'installe par-dessus le précédent
    signingConfigs {
        getByName("debug") { storeFile = file("debug.keystore") }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    buildFeatures { buildConfig = true }
    sourceSets["main"].assets.srcDir(page)
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

tasks.named("preBuild") {
    doFirst {
        check(page.resolve("index.html").isFile) { "Construire d'abord la page : cd trainer && npm ci && npm run build" }
    }
}
