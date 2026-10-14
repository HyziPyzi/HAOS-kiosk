# TV Launcher 2.1.0 validation — 2026-10-14

Passed in [GitHub Actions](https://github.com/HyziPyzi/HAOS-kiosk/actions/runs/38623977297)
on commit `9ddcb30`; subsequent release documentation changes do not alter runtime code.
The profile regression test additionally waits for the fixture document to commit
and asserts storage/cookie writes before restarting Chrome. A CDP target's URL can
be announced before that document is ready; the persistence assertions remain strict.
Launcher navigation tests also wait for a fresh document when reloading the same
URL, so test keystrokes cannot be sent to the outgoing launcher DOM.
The amd64 Docker build installs official **Google Chrome 155.0.8059.79** on the same
pinned Home Assistant Debian Trixie base. No Chrome or Widevine binaries/images
are published. Local Docker Desktop could not start because of an inaccessible
`sailor-ingest.sock`; the full container build and checks ran on the CI runner.

- Docker build, Hadolint, Bash syntax/ShellCheck, YAML/JSON/Python/JavaScript syntax,
  required executables and official Supervisor 2026.09.3 option validation passed.
- **12 runtime tests passed**, including all seven baseline regression tests.
- Actual Chrome in Xvfb at 1920×1080: six tiles fit without page scrolling,
  focus follows arrow navigation, grid edges, Enter, Backspace, Escape and BrowserBack
  handling, WWW validation and dialog navigation.
- VOD destination strings checked against their intended URLs; all four tiles,
  HA tile and WWW dialog navigate to local fixture pages in the same tab.
  These fixtures do not test remote service availability, logins or playback.
- Actual Openbox generated from production `run.sh`: xdotool Ctrl+Alt+H returns
  from a fixture that consumes browser keyboard events to the launcher.
- Existing bearer-authenticated `/launch_url` invokes the real Chrome CDP CLI.
- Loopback launcher works with a bearer token configured; protected REST commands
  still require it. LAN clients, forged forwarded headers, foreign Origin and
  non-loopback Host headers cannot access the launcher.
- A configured second listener also serves loopback on the same port, retaining
  API authorization. `home_assistant` startup and HTTP failure fallback checked.
- Profile/cookies/local storage survive Chrome restart; Widevine EME negotiation
  returns `available`. Audio mode selection regression checks passed.
- Clean 1080p screenshot inspected; CI saves it as `tv-launcher-preview`.

Still required on the physical NUC: upgrade/startup under HAOS, launcher and global
shortcut with the actual keyboard/remote, USB/Bluetooth HID pairing/keycodes,
Intel i915/GPU decoding, HDMI video/audio after the update, and actual protected
Netflix/Max/Prime playback. Version 2.0.0 HDMI display was reported working by the
user; this does not establish hardware compatibility of the new launcher release.
Bluetooth pairing and HDMI-CEC support have not been added.

Rollback: choose `start_page: home_assistant` to restore the previous start page.
For the full previous version/profile use an app backup made before upgrading;
the source baseline is also preserved under tag `v2.0.0`.

# Previous 2.0.0 local validation — 2026-09-30

The final amd64 image builds successfully in Docker Desktop's Linux engine.
Google Chrome Stable installed through Google's signed APT repository:
**154.0.8037.92**. HA Debian Trixie base index digest:
`sha256:01e153da2c2579f2cf5010901da7bc31b1dd035921ea46ccaff22e521efa74a7`.

Passed:

- Docker build with the explicit default base, and with that same `BUILD_FROM` supplied explicitly.
- Hadolint (DL3008 intentionally excluded: apt installs current security/Chrome releases).
- Bash syntax and ShellCheck 0.10.0, including all severity levels for `run.sh`.
- YAML/JSON parsing, Python AST/syntax for all shipped Python files.
- Official stable Supervisor **2026.09.3** app configuration and default option validation.
- Required executables, modesetting/libinput Xorg modules, Python dependencies and Onboard assets present.
- No Alpine package commands or Alpine runtime paths in the build/start scripts.
- Seven runtime/security tests: URL/origin boundaries, nonlocal REST token requirement,
  existing Preferences preservation, audio selection and unavailable server tolerance,
  REST authorization/editor/foreign-origin checks, forwarded-header isolation,
  and actual Chrome in virtual X11 using the production launch flags.
- CDP navigation/reload, actual DevTools listen address **127.0.0.1:9222**,
  cookies and local storage preserved across normal browser shutdown/restart.
- Google-packaged Widevine library found; `com.widevine.alpha` EME key-system negotiation returned **available**.
- Matching README and in-app DOCS, `git diff --check`, scan for common token/private-key formats.

Commands are in the README and `.github/workflows/validate.yml`.
Test containers/images remain local or ephemeral CI builds; no Chrome/CDM image is published.

Not performed: installation under Supervisor on physical HAOS, physical HDMI/EDID,
i915/Intel HD 520 acceleration and codec decoding, USB/touch on the NUC,
Supervisor HDMI audio, Netflix/Max/Prime/Spotify account login and actual protected
content license/playback, HDCP, long-duration playback, 4K/HDR.
Virtual X11 EME negotiation does not establish service compatibility or playback quality.
