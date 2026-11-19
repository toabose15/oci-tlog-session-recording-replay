# Replay-host assets

`deploy-cockpit-replay.sh` installs these assets onto a new Oracle Linux 9
replay host. Do not run the helpers directly from this directory.

| Path | Installed location | Purpose |
| --- | --- | --- |
| `cockpit/` | Cockpit user's local application directory | Browser UI for search, playback, and authorized download. |
| `libexec/` | `/usr/local/libexec/` | Privileged helpers for query, preparation, frames, playback, timeline, export, and health checks. |
| `sbin/tlog-replay-sync` | `/usr/local/sbin/tlog-replay-sync` | Synchronizes the Object Storage archive and local replay catalog. |

The deployment script owns installation paths, file modes, service definitions,
and runtime configuration. Change assets and the deployer together, then test on
a clean Oracle Linux 9 host.
