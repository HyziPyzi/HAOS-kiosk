# Official HA Debian base, verified for linux/amd64 on 2026-09-30.
# Supervisor 2026.04+ no longer supplies BUILD_FROM; use an explicit default.
ARG BUILD_FROM=ghcr.io/home-assistant/base-debian:trixie@sha256:01e153da2c2579f2cf5010901da7bc31b1dd035921ea46ccaff22e521efa74a7
FROM ${BUILD_FROM}

ARG BUILD_VERSION=2.0.0
ARG BUILD_ARCH=amd64
ENV ADDON_VERSION=${BUILD_VERSION} DISPLAY=:0 LANG=C.UTF-8
LABEL io.hass.version="${BUILD_VERSION}" io.hass.type="app" io.hass.arch="${BUILD_ARCH}"

# modesetting is included in xserver-xorg-core. No desktop environment.
RUN test "$(dpkg --print-architecture)" = amd64 \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg \
        xserver-xorg-core xserver-xorg-input-libinput \
        x11-xserver-utils x11-utils x11-xkb-utils xauth \
        libgl1-mesa-dri libegl1 libgl1 libglx-mesa0 libdrm2 \
        mesa-utils vainfo intel-media-va-driver \
        xdotool xinput libinput-tools udev evtest \
        openbox onboard unclutter-xfixes scrot x11vnc \
        fonts-dejavu-core fonts-noto-core fonts-noto-color-emoji \
        dbus dbus-x11 dconf-cli libglib2.0-bin gsettings-desktop-schemas \
        util-linux bsdextrautils procps psmisc iproute2 iputils-ping tree libnotify-bin \
        pulseaudio-utils libasound2-plugins alsa-utils \
        python3 python3-xlib python3-aiohttp \
    && install -d -m 0755 /etc/apt/keyrings \
    && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub -o /tmp/google-signing-key.pub \
    && gpg --batch --dearmor -o /etc/apt/keyrings/google-chrome.gpg /tmp/google-signing-key.pub \
    && chmod 0644 /etc/apt/keyrings/google-chrome.gpg \
    && printf '%s\n' 'deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main' > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends google-chrome-stable \
    && command -v google-chrome-stable \
    && google-chrome-stable --version \
    && rm -f /tmp/google-signing-key.pub \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /
COPY xorg.conf.default /etc/X11/
COPY translations/*.yaml /translations/
COPY run.sh browser_ctl.py chromium_watchdog.py rest_server.py mouse_touch_inputs.py gesture_commands.json /
RUN chmod 0755 /run.sh
CMD ["/run.sh"]
