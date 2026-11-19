# Replay helper programs

These executable helpers perform the replay-host operations requested by the
Cockpit application: catalogue query, archive preparation, event and frame
generation, timeline production, terminal playback, authorized export, and
health checks.

The deployment script installs them in `/usr/local/libexec/` with controlled
permissions. Do not expose them through a general web server or execute them
with untrusted user input outside the Cockpit authorization path.
