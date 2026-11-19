# OCI Logging Analytics content

This directory contains the reusable Logging Analytics content for the TLOG
session-recording investigation workflow.

| Path | Contents |
| --- | --- |
| [`Parsers/`](Parsers/README.md) | Parser exports for TLOG, Auditd, and Syslog custom-log events. |
| [`Sources/`](Sources/README.md) | Source exports that associate incoming custom-log records with parser chains. |
| [`Dashboard/`](Dashboard/README.md) | The Privileged Access & Session Investigation dashboard export. |

## Import order

1. Import parser chains.
2. Import sources and associate them with the appropriate OCI custom logs.
3. Confirm parsed events for TLOG, Linux Audit, and Linux security logs.
4. Import the dashboard and reconnect saved-search references in the target
   tenancy.

## SSH geolocation enrichment

The `com.oraclecloud.logging.custom.Syslog` source export already contains the
**Geolocation** source function. It uses the parsed `SSH Source IP` field as
its input and populates the following output fields:

- Client Host Continent and Continent Code
- Client Host Country and Country Code
- Client Host Region and Region Code
- Client Host City
- Client Coordinates

Import the Syslog parser before the Syslog source so that `SSH Source IP` is
available to the function. After import, confirm that a non-private source IP
populates `Client Coordinates`, `Client Host Country`, and related fields.
Private RFC 1918 addresses normally do not return useful public geolocation,
so use an approved publicly routable test source when validating the dashboard
map. The dashboard's **SSH access origins** and **SSH access map** widgets rely
on these enriched fields.

## Tenant-specific content

The dashboard and extracted parser/source XML files use OCID placeholders.
Before exporting replacement ZIPs or importing into another tenancy, review all
metadata and test the content in a non-production tenancy.
