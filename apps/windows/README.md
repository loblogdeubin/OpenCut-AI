# OpenCut AI for Windows

This Electron shell packages the production Next.js standalone server, Chromium runtime, FFmpeg/ffprobe, whisper.cpp, and the multilingual base model into Windows x64 distributions.

## Artifacts

- `OpenCut-AI-Setup-<version>-x64.exe` — assisted NSIS installer.
- `OpenCut-AI-Portable-<version>-x64.exe` — portable executable.

Both artifacts are currently unsigned. Windows SmartScreen may show an unknown-publisher warning until a code-signing certificate is configured.

## Build

Use the **Windows Desktop Release** GitHub Actions workflow. A Windows runner is required because Next.js and Electron include platform-specific native modules.

The workflow can be started manually and uploads both executables as a GitHub Actions artifact. Pushing a tag such as `windows-v0.1.0` also creates a GitHub Release.
