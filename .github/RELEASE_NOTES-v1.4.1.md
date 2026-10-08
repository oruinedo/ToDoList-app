Todo Desktop v1.4.1 adds a single-file Windows x64 portable app.

## Download and run

1. Download `TodoDesktop-1.4.1-win32-x64.exe`.
2. Double-click the downloaded EXE. It unpacks its application files and launches Todo Desktop automatically.

No separate ZIP, Node.js installation, CMD command, installer, or copying adjacent runtime files is needed. The app continues to save tasks and settings in `%APPDATA%\TodoDesktop`.

Windows can display a SmartScreen notice because the EXE is currently unsigned. Verify that the download came from this repository. Do not turn off security software.

`SHA256SUMS.txt` contains the EXE's SHA-256 digest for optional verification.

## Source

The source release retains the Node.js 22.12+ development workflow. The portable EXE is built for Windows x64 on GitHub Actions with `electron-builder` 26.17.0.
