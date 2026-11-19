# Cockpit replay-host deployment

`deploy-cockpit-replay.sh` installs the private Cockpit replay application on
a **new Oracle Linux 9** Compute instance. It configures Cockpit, the local
replay cache, metadata index, archive synchronization timer, and optional
failure notifications.

## Prerequisites

- A new Oracle Linux 9 Compute instance in the replay-host dynamic group.
- An instance-principal policy that permits the dynamic group to list and get
  objects in the selected TLOG archive bucket.
- The Object Storage namespace, bucket name, and recording prefix.
- An approved administrator CIDR for Cockpit access.
- A root-only file containing the initial Cockpit administrator password.
- OCI NSG/security-list access for TCP/9090 from the same approved CIDR.

## Deploy

Copy this directory to the replay host. As `root`, create a root-only password
file and run the deployer:

```bash
install -m 0600 /dev/null /root/replayadmin.password
read -r -s -p 'Cockpit password: ' password; printf '%s\n' "$password" > /root/replayadmin.password; unset password

sudo bash deploy-cockpit-replay.sh \
  --admin-user replayadmin \
  --admin-password-file /root/replayadmin.password \
  --bucket-namespace <namespace> \
  --bucket-name <bucket> \
  --object-prefix <prefix> \
  --active-cache-days 7 \
  --metadata-days 30 \
  --cockpit-source-cidr <administrator-cidr> \
  --sync-interval-minutes 5
```

Optionally pass `--notification-topic-ocid <topic-ocid>` after granting the
replay-host dynamic group permission to publish to that topic.

## Verify

1. Confirm the deployment completed without an instance-principal error.
2. Confirm the timer is running:

   ```bash
   systemctl status tlog-replay-sync.timer
   systemctl list-timers tlog-replay-sync.timer
   ```

3. Open `https://<replay-host>:9090` from the approved administrator network
   and sign in as the configured administrator.
4. Confirm an archived recording appears after synchronization, can be
   retrieved, and plays in the terminal UI.

The deployer rejects public `0.0.0.0/0` Cockpit exposure and rejects an active
cache retention longer than the metadata retention.
