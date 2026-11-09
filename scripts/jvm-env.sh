#!/usr/bin/env bash
# When no JDK is on PATH (/usr/bin/java on macOS is not a real one), look for Homebrew's openjdk and add it to PATH
if ! javac -version >/dev/null 2>&1; then
  for d in /opt/homebrew/opt/openjdk /usr/local/opt/openjdk; do
    if [ -x "$d/bin/javac" ]; then
      export JAVA_HOME="$d"
      export PATH="$d/bin:$PATH"
      break
    fi
  done
fi
javac -version >/dev/null 2>&1 || { echo "JDK が見つかりません（brew install openjdk）" >&2; exit 1; }
