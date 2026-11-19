# Privileged Access & Session Investigation dashboard

`Privileged Access & Session Investigation.json` is the dashboard export for
correlating SSH activity, sudo activity, Linux Audit execution events, and
TLOG recording metadata.

The export replaces OCI identifiers with resource-type placeholders such as:

```text
ocid1.managementdashboard.oc1..XXX
ocid1.managementsavedsearch.oc1..XXX
ocid1.compartment.oc1..XXX
ocid1.tenancy.oc1..XXX
```

## Before import

1. Import the parser and source exports.
2. Create or import the saved searches required by the widgets.
3. Replace placeholder OCIDs and reconnect saved-search references in the
   target tenancy.
4. Validate widgets with non-sensitive data before sharing the dashboard.

Keep terminal content out of broadly shared widgets. Use the dashboard to find
recording metadata, then use the restricted Cockpit replay workflow when an
investigator needs session content.
