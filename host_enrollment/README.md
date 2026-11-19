# Host enrollment

This directory contains the supported TLOG enrollment paths for Oracle Linux 8
and 9. Both use the same all-user recording design: interactive local users,
including `root`, are recorded.

| Path | Use when |
| --- | --- |
| [`existing_instances/`](existing_instances/README.md) | The Oracle Linux host already exists and you can administer it directly. |
| [`new_instances/`](new_instances/README.md) | You are creating a new Oracle Linux 8 or 9 Compute instance and want cloud-init to enroll it at launch. |

Before using either path, create the OCI Unified Monitoring Agent
configuration that collects `/var/log/tlog/tlog.jsonl`, `/var/log/audit/audit.log`,
and `/var/log/secure` from hosts selected by your approved tag/dynamic-group
model.

Oracle Linux 10 is not covered by this repository's supported enrollment path.
