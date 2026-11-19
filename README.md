# OCI TLOG session recording, investigation, and replay

This repository provides a reference implementation for recording interactive
Oracle Linux sessions with TLOG, sending security evidence to OCI Logging and
Logging Analytics, and replaying archived session recordings through a private
Cockpit host.

The implementation collects three related evidence streams from each enrolled
host:

- TLOG session events from `/var/log/tlog/tlog.jsonl`
- Linux Audit events from `/var/log/audit/audit.log`
- Linux security events from `/var/log/secure`

The Unified Monitoring Agent collects the local files. OCI Connector Hub sends
the security-investigation route to a shared Logging Analytics log group and
archives TLOG session events in Object Storage. A dedicated Cockpit replay host
uses an instance principal to retrieve authorized recordings from the archive.

> **Security warning:** TLOG can capture terminal input and output, including
> credentials and other sensitive content. Complete a security review, define
> evidence retention, and enforce least-privilege access before enabling this
> implementation.

> **Sample implementation disclaimer:** All artifacts in this repository are
> sample demonstrations provided for evaluation and learning. They are not
> production-ready and are supplied without any commitment that they meet your
> security, availability, compliance, performance, or operational requirements.
> Before deploying any artifact, customers must perform their own architecture
> review, security assessment, functional and scale testing, and validation in
> a non-production environment. Adapt configurations, IAM policies, retention,
> monitoring, backup, and recovery controls to the customer's requirements.

## Repository layout

| Path | Purpose |
| --- | --- |
| [`host_enrollment/`](host_enrollment/README.md) | Enroll Oracle Linux 8/9 hosts for TLOG recording. |
| [`host_enrollment/existing_instances/`](host_enrollment/existing_instances/README.md) | Script and instructions for already-running hosts. |
| [`host_enrollment/new_instances/`](host_enrollment/new_instances/README.md) | Cloud-init user data for new Oracle Linux 8/9 instances. |
| [`logging_analytics/`](logging_analytics/README.md) | Log Analytics parser, source, and dashboard exports. |
| [`cockpit-replay-deployment/`](cockpit-replay-deployment/README.md) | Oracle Linux 9 Cockpit replay-host deployment package. |

## Deployment sequence

1. Review the security warning and define the approved retention periods for
   host JSONL, OCI Logging, Logging Analytics, Object Storage, replay cache,
   and replay metadata.
2. Create the OCI custom logs, Unified Monitoring Agent configuration, two
   Connector Hub routes, Object Storage archive, and least-privilege dynamic
   group policies.
3. Import the Log Analytics parsers and sources, then import and reconnect the
   dashboard's saved-search dependencies in the target tenancy.
4. Enroll a pilot Oracle Linux 8 or 9 host.
5. Verify local TLOG JSONL, OCI custom-log ingestion, parsed Log Analytics
   evidence, and Object Storage archiving.
6. Deploy the private Cockpit replay host on a new Oracle Linux 9 instance.
7. Validate instance-principal retrieval, search, playback, timer operation,
   and approved network access before a production rollout.

## Quick start: existing host

After the OCI agent configuration has been created and assigned to the host,
run the enrollment script as `root` on an Oracle Linux 8 or 9 pilot host:

```bash
sudo bash host_enrollment/existing_instances/tlog-all-users-enroll.sh \
  --accept-sensitive-input-capture \
  --local-retention-days 30
```

Open a new SSH session, execute a harmless command, and confirm that TLOG
events appear locally:

```bash
sudo tail -n 1 /var/log/tlog/tlog.jsonl | jq -c '{rec, user, host, time}'
sudo -u oracle-cloud-agent head -n 1 /var/log/tlog/tlog.jsonl
```

See the [existing-instance guide](host_enrollment/existing_instances/README.md)
for prerequisites, recovery mode, and verification.

## Publication hygiene

The dashboard JSON and extracted parser/source XML files use placeholder OCIDs.
Review every future OCI Console export before adding it to the repository. Do
not commit credentials, private keys, host inventories, recordings, Object
Storage objects, or screenshots containing customer data.

This repository does not include a license. Add the organization-approved
license before public distribution.
