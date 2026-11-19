# Parser exports

Each parser export is stored in its own extracted directory with `content.xml`
and the original export `README.txt`. Import these parser chains into OCI
Logging Analytics before importing their corresponding sources.

| Export | Purpose |
| --- | --- |
| `TLOG Session JSON_*` | Parses the native TLOG session event payload. |
| `TLOG OCI Logging Wrapper_*` | Unwraps the OCI Logging custom-log envelope around TLOG events. |
| `OCI Custom Auditd JSON_*` | Parses Linux Audit events. |
| `OCI Custom Syslog JSON_*` | Parses Linux Syslog security events. |

All OCI OCIDs in the included XML files are placeholders. After import, verify
parser fields with a non-sensitive test event.
