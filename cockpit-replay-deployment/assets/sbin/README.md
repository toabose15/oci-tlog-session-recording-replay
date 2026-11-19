# Replay synchronization service

`tlog-replay-sync` indexes the configured Object Storage archive and maintains
the local replay catalogue and cache. The deployment script installs it as
`/usr/local/sbin/tlog-replay-sync` and schedules it with a systemd timer.

Run the deployer instead of installing this helper manually so its archive,
retention, and instance-principal configuration remain aligned with the Cockpit
application.
