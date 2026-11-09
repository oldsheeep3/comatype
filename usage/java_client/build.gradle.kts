plugins {
    java
}

repositories { mavenCentral() }

dependencies {
    // The Comatype runtime from Maven Central
    implementation("net.sheeplab.comatype:comatype:0.0.3")
}

// The runtime needs Java 21 or later
tasks.withType<JavaCompile> { options.release.set(21) }
