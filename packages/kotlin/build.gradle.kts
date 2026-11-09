plugins {
    kotlin("jvm")
    id("com.vanniktech.maven.publish")
    id("com.diffplug.spotless")
}

spotless {
    kotlin {
        target("src/**/*.kt")
        ktlint().editorConfigOverride(
            mapOf(
                "indent_size" to "4",
                "ktlint_standard_max-line-length" to "disabled",
                "ktlint_standard_no-wildcard-imports" to "disabled",
                "ktlint_standard_function-signature" to "disabled",
                "ktlint_standard_filename" to "disabled",
            ),
        )
    }
}

tasks.withType<JavaCompile> { options.release.set(21) }
kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21) } }

dependencies {
    api(project(":java"))
}

mavenPublishing {
    publishToMavenCentral(com.vanniktech.maven.publish.SonatypeHost.CENTRAL_PORTAL, automaticRelease = true)
    if (System.getenv("ORG_GRADLE_PROJECT_signingInMemoryKey") != null) signAllPublications()
    coordinates("net.sheeplab.comatype", "comatype-ktx", project.version.toString())
    pom {
        name.set("comatype-ktx")
        description.set("Comatype runtime for Kotlin (coroutine client and server)")
        url.set("https://github.com/oldsheeep3/comatype")
        licenses { license { name.set("MIT"); url.set("https://opensource.org/licenses/MIT") } }
        developers { developer { id.set("oldsheeep3"); name.set("oldsheeep3") } }
        scm {
            url.set("https://github.com/oldsheeep3/comatype")
            connection.set("scm:git:https://github.com/oldsheeep3/comatype.git")
            developerConnection.set("scm:git:ssh://git@github.com/oldsheeep3/comatype.git")
        }
    }
}
