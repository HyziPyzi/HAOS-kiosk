# Local validation image only. Never publish images containing Google Chrome.
FROM haoskiosk-chrome:test
RUN apt-get update \
    && apt-get install -y --no-install-recommends shellcheck python3-yaml xvfb \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
ENTRYPOINT ["/bin/bash"]
CMD ["tests/check.sh"]
