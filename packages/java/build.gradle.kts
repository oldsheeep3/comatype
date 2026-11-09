plugins {
    `java-library`
    id("com.vanniktech.maven.publish")
}

// JDK 21 or later builds it; the output targets Java 21
tasks.withType<JavaCompile> { options.release.set(21) }

// The unit tests are a plain `main` (no test library): run them with `./gradlew :java:selfTest`
tasks.register<JavaExec>("selfTest") {
    classpath = sourceSets["test"].runtimeClasspath
    mainClass.set("comatype.ComatypeTest")
}

mavenPublishing {
    publishToMavenCentral(com.vanniktech.maven.publish.SonatypeHost.CENTRAL_PORTAL)
    if (System.getenv("ORG_GRADLE_PROJECT_signingInMemoryKey") != null) signAllPublications()
    coordinates("io.github.oldsheeep3", "comatype", project.version.toString())
    pom {
        name.set("comatype")
        description.set("Comatype runtime for Java (types, validation, client and server)")
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
