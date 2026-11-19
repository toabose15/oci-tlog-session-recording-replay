# Source exports

Each source export is stored in its own extracted directory with `content.xml`
and the original export `README.txt`. They define the Logging Analytics sources
for the custom logs collected by the Unified Monitoring Agent.

| Export | Evidence stream |
| --- | --- |
| `com.oraclecloud.logging.custom.tlog-session-raw_*` | TLOG session events. |
| `com.oraclecloud.logging.custom.Auditd_*` | Linux Audit events. |
| `com.oraclecloud.logging.custom.Syslog_*` | Linux security events. |

Import parser chains first, then import each source and confirm it is
associated with the correct custom log. Test with a non-sensitive SSH session,
Audit event, and Syslog event before using the dashboard.

All OCI OCIDs in the included XML files are placeholders. Review the remaining
metadata before importing into another tenancy.
