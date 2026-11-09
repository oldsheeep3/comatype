// Shared settings of the JVM runtimes. The version is stamped by CI (-PreleaseVersion=x.y.z); locally it is 0.0.1-SNAPSHOT.
plugins {
    id("com.vanniktech.maven.publish") version "0.30.0" apply false
    kotlin("jvm") version "2.4.21" apply false
}

allprojects {
    group = "net.sheeplab.comatype"
    version = (findProperty("releaseVersion") as String?) ?: "0.0.1-SNAPSHOT"
    repositories { mavenCentral() }
}
