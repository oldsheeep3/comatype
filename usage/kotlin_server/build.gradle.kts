plugins {
    kotlin("jvm") version "2.4.21"
}

repositories { mavenCentral() }

dependencies {
    // The Comatype coroutine runtime from Maven Central (it brings net.sheeplab.comatype:comatype with it)
    implementation("net.sheeplab.comatype:comatype-ktx:0.0.3")
}

// The runtime needs Java 21 or later
tasks.withType<JavaCompile> { options.release.set(21) }
kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21) } }

// The sample files sit in the project directory; the generated code is in src/main/kotlin/comatype/gen
sourceSets["main"].kotlin.srcDirs(".", "src/main/kotlin")
sourceSets["main"].kotlin.exclude("**/*.kts", "build/**", ".gradle/**")
