# Enroll new Oracle Linux 8/9 instances with cloud-init

Use `cloud-init-ol8-ol9-tlog-enrollment-readable.yaml` as Compute instance
**user data**. It embeds the supported TLOG enrollment script as readable text
under `write_files`, then runs it once after the `oracle-cloud-agent` account
is available. It does not download content from GitHub.

## Before launch

- Review the embedded enrollment script and the configured local retention
  value (`30` days by default).
- Apply the OCI tag that selects the new instance for the Unified Monitoring
  Agent configuration at launch.
- Confirm that the agent configuration has custom-log file inputs for
  `/var/log/tlog/tlog.jsonl`, `/var/log/audit/audit.log`, and `/var/log/secure`.
- Use Oracle Linux 8 or 9 only.

## What cloud-init does

The bootstrap waits for `oracle-cloud-agent`, runs enrollment once, and writes
its output to `/var/log/tlog-cloud-init-enrollment.log`. A successful run
creates `/var/lib/tlog-cloud-init-enrollment.complete`. The host can finish
local enrollment before OCI has delivered the agent configuration, so validate
the agent path after launch.

## Input parameters

The cloud-init file does not take command-line parameters from the Compute
console. Instead, it passes fixed enrollment arguments from the local runner:

```bash
enrollment_args=(--accept-sensitive-input-capture --local-retention-days 30)
```

Before launch, change only the `30` value when a different approved
host-local retention period is required.

| Input | How it is set | Meaning |
| --- | --- | --- |
| Sensitive-input acknowledgement | Fixed in the embedded runner as `--accept-sensitive-input-capture` | Enables terminal-input capture. This is intentional and requires the same security approval as existing-instance enrollment. |
| Local retention days | The positive whole number after `--local-retention-days`; default `30` | Retains rotated local `/var/log/tlog/tlog.jsonl` files for the specified number of days. |
| Authselect repair | Added automatically for Oracle Linux 8 only | Adds `--repair-authselect` because some OL8 images can begin with an invalid rendered authselect state. Oracle Linux 9 does not add this option by default. |

### Local log retention

The local retention value configures daily rotation of
`/var/log/tlog/tlog.jsonl` on the new instance. It controls only host-local
rotated JSONL files. It does **not** set OCI Logging, Logging Analytics, Object
Storage, Cockpit replay-cache, or Cockpit metadata-index retention.

For example, to use 14 days, change the runner line before supplying the YAML
as user data:

```bash
enrollment_args=(--accept-sensitive-input-capture --local-retention-days 14)
```

Do not use `0`, a negative number, or a non-numeric value; the embedded
enrollment script rejects anything other than a positive whole number.

After first SSH login and a harmless command, verify:

```bash
sudo tail -n 100 /var/log/tlog-cloud-init-enrollment.log
sudo test -f /var/lib/tlog-cloud-init-enrollment.complete
sudo tail -n 1 /var/log/tlog/tlog.jsonl | jq -c '{rec, user, host, time, in_txt}'
sudo -u oracle-cloud-agent head -n 1 /var/log/tlog/tlog.jsonl
```

## Relationship to existing-instance enrollment

The embedded script follows the same supported policy as
[`../existing_instances/tlog-all-users-enroll.sh`](../existing_instances/tlog-all-users-enroll.sh).
Update both artifacts together whenever the enrollment policy changes.
