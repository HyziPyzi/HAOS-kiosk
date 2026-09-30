# Local validation — 2026-09-30

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
