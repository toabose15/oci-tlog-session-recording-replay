# Oracle Linux 8/9 TLOG host enrollment

`tlog-all-users-enroll.sh` is the supported target-host enrollment script for
Oracle Linux 8 and 9. It creates the all-user recording model used by this
implementation: interactive local users, including `root`, are recorded.

It does not create OCI resources. Before running it, create the OCI custom-log
inputs and an agent configuration that collects `/var/log/tlog/tlog.jsonl` for
the hosts selected by your dynamic group.

## What it changes

- Installs `tlog`, `sssd`, `rsyslog`, and `jq`.
- Enables the `with-files-domain` authselect feature and configures SSSD's
  local files domain.
- Sets the SSSD session-recording scope to `all`.
- Records terminal input, output, and window size in the persistent systemd
  journal.
- Writes TLOG JSON events to `/var/log/tlog/tlog.jsonl` with read access for
  `oracle-cloud-agent`.
- Adds daily JSONL rotation; its retention is a run-time parameter.

Terminal input can include passwords, tokens, and other secrets. Protect the
local file, OCI log, downstream connectors, archive, and replay access before
enrollment.

## Prerequisites

- Oracle Linux 8 or 9.
- A reviewed OCI Unified Monitoring Agent configuration that collects
  `/var/log/tlog/tlog.jsonl`, `/var/log/audit/audit.log`, and `/var/log/secure`.
- The host is selected for that configuration through your approved OCI
  tag/dynamic-group model.
- A maintenance window and console/recovery access appropriate for a change to
  PAM, SSSD, and authselect configuration.

## Enroll the host

1. Apply the OCI tag that selects the host for the Unified Monitoring Agent
   configuration.
2. Copy the versioned script to the host through your approved administration
   path.
3. Review any existing PAM, SSSD, and authselect customization.
4. Run the script as root:

   ```bash
   sudo bash tlog-all-users-enroll.sh \
     --accept-sensitive-input-capture \
     --local-retention-days 30
   ```

5. Disconnect, open a new SSH session, run a harmless command, and exit.
6. Verify local output and the agent's read access:

   ```bash
   sudo tail -n 1 /var/log/tlog/tlog.jsonl | \
     jq -c '{rec, user, host, time, in_txt}'
   sudo -u oracle-cloud-agent head -n 1 /var/log/tlog/tlog.jsonl
   ```

If `authselect check` is invalid or the current profile cannot provide
`with-files-domain`, review the PAM customization first, then use the explicit
repair mode:

```bash
sudo bash tlog-all-users-enroll.sh \
  --accept-sensitive-input-capture \
  --repair-authselect \
  --local-retention-days 30
```

Repair mode backs up the live PAM and NSS files under
`/root/tlog-enrollment-backups/<UTC timestamp>/`, builds a custom SSSD profile
from the active configuration, and retains the feature-capable SSSD template.
It should be piloted before a fleet rollout.

## Input parameters

| Parameter | Required | Meaning |
| --- | --- | --- |
| `--accept-sensitive-input-capture` | Yes | Explicitly acknowledges that the configuration records typed terminal input as well as terminal output. The script stops if this flag is absent. |
| `--local-retention-days DAYS` | No | Number of days to retain **rotated host-local** TLOG JSONL files. `DAYS` must be a positive whole number. The default is `30`. |
| `--repair-authselect` | No | Repairs an invalid or feature-incomplete authselect profile by creating a custom SSSD profile that preserves the current PAM files. Use only after reviewing the existing PAM/authselect customization and ensuring console recovery access. |

### Local log retention

`--local-retention-days` controls the logrotate policy for
`/var/log/tlog/tlog.jsonl` on the enrolled host. The script rotates the local
JSONL file daily and configures both `rotate DAYS` and `maxage DAYS`.

For example, this retains rotated local TLOG JSONL files for 14 days:

```bash
sudo bash tlog-all-users-enroll.sh \
  --accept-sensitive-input-capture \
  --local-retention-days 14
```

This setting does **not** set retention for OCI Logging, Logging Analytics,
Object Storage, the Cockpit replay cache, or the Cockpit metadata index. Define
those retention periods independently in their respective OCI and replay-host
configurations.

## New instances

For instances created after this repository is deployed, use the
[cloud-init enrollment path](../new_instances/README.md). It embeds the same
supported enrollment implementation and avoids maintaining a separate TLOG
policy.

## OCI agent verification

The script can configure the host before the centralized agent configuration
reaches it. Confirm the downloaded configuration eventually includes the TLOG
path:

```bash
sudo grep -n -F '/var/log/tlog/tlog.jsonl' \
  /etc/unified-monitoring-agent/conf.d/fluentd_config/fluentd.conf
```

No output means the tag, dynamic group, or agent-configuration rollout still
needs attention. The local JSONL validation above remains useful even before
OCI ingestion arrives.

## Scope

Oracle Linux 10 is intentionally not part of this supported path. Test any
OL10 design separately; it does not provide equivalent local-user or root
coverage.
