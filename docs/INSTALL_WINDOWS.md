# OmniFlow QA for Windows

## Standard installation

1. Download or copy `OmniFlow-QA-Setup.exe` to the Windows computer.
2. Run the installer and choose the installation directory.
3. Launch **OmniFlow QA** from the Start menu or desktop shortcut.

The setup file includes OmniFlow QA, Electron, Chromium, and the required
JavaScript packages. A standard desktop/web user does **not** need to install
Node.js, npm, Chrome, or Chromium separately.

Windows may display a SmartScreen warning because locally produced builds are
not code-signed. Verify the SHA-256 checksum supplied with the setup file before
choosing **Run anyway**. Production releases should be signed with a trusted
Windows code-signing certificate.

## Optional Android automation setup

Android recording and replay require additional developer tools that are not
bundled in the Windows installer:

1. Install a current Java Development Kit (JDK), such as
   [Microsoft Build of OpenJDK](https://learn.microsoft.com/java/openjdk/download).
2. Install Google's
   [Android SDK Platform Tools](https://developer.android.com/tools/releases/platform-tools)
   and add its directory to `PATH` so the `adb` command is available.
3. Install [Node.js 22 LTS](https://nodejs.org/en/download), which includes npm.
4. Open PowerShell and run:

   ```powershell
   npm install --global appium@3
   appium driver install uiautomator2
   ```

5. Enable USB debugging on the Android device (or start an emulator), connect
   it, and accept the authorization prompt.
6. Open OmniFlow QA's **Setup Doctor** to verify Java, ADB, Appium,
   UiAutomator2, and the connected device.

[scrcpy](https://github.com/Genymobile/scrcpy) is optional. It enables the
lowest-latency device mirror; OmniFlow QA can fall back to MJPEG or screenshots.

## For developers building the installer

Building requires Node.js 20 or 22 and npm 10:

```powershell
npm install
npm run check
npm run package
```

The shareable installer is written to `release/OmniFlow-QA-Setup.exe`.
