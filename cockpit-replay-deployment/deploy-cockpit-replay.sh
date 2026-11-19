#!/usr/bin/env bash
# Deploy the OL9 Cockpit TLOG replay host from this package.
set -euo pipefail

asset_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/assets"
admin_user= admin_password_file= namespace= bucket= prefix= source_cidr= topic_ocid=
cache_days= metadata_days= sync_minutes=5
die(){ printf 'ERROR: %s\n' "$*" >&2; exit 1; }
usage(){ cat <<'EOF'
Usage: sudo ./deploy-cockpit-replay.sh --admin-user USER --admin-password-file FILE \
  --bucket-namespace NS --bucket-name BUCKET --object-prefix PREFIX \
  --active-cache-days DAYS --metadata-days DAYS --cockpit-source-cidr CIDR [options]
Options: --sync-interval-minutes N  --notification-topic-ocid OCID
EOF
}
while [[ $# -gt 0 ]]; do case "$1" in
  --admin-user) admin_user=$2; shift 2;; --admin-password-file) admin_password_file=$2; shift 2;;
  --bucket-namespace) namespace=$2; shift 2;; --bucket-name) bucket=$2; shift 2;; --object-prefix) prefix=$2; shift 2;;
  --active-cache-days) cache_days=$2; shift 2;; --metadata-days) metadata_days=$2; shift 2;;
  --cockpit-source-cidr) source_cidr=$2; shift 2;; --sync-interval-minutes) sync_minutes=$2; shift 2;;
  --notification-topic-ocid) topic_ocid=$2; shift 2;; -h|--help) usage; exit 0;; *) die "Unknown option: $1";; esac; done
[[ $EUID -eq 0 ]] || die 'Run as root.'
[[ -r /etc/os-release ]] && source /etc/os-release
[[ "${ID:-}" == ol && "${VERSION_ID%%.*}" == 9 ]] || die 'This deployer supports Oracle Linux 9 only.'
[[ "$admin_user" =~ ^[a-z_][a-z0-9_-]*$ ]] || die 'Invalid admin user.'
[[ -r "$admin_password_file" ]] || die 'Provide a readable root-only password file.'
[[ "$cache_days" =~ ^[1-9][0-9]*$ && "$metadata_days" =~ ^[1-9][0-9]*$ && "$sync_minutes" =~ ^[1-9][0-9]*$ ]] || die 'Retention and interval values must be positive integers.'
(( cache_days <= metadata_days )) || die 'Active cache days cannot exceed metadata days.'
[[ "$source_cidr" != '0.0.0.0/0' ]] || die 'Refusing public Cockpit exposure; provide an administrator CIDR.'
[[ -d "$asset_dir" ]] || die 'Assets directory is missing.'

# Install the supported runtime and verify instance-principal read access before changing Cockpit.
dnf install -y oraclelinux-developer-release-el9 python39-oci-cli cockpit cockpit-session-recording tlog sqlite jq nodejs npm python3
OCI_CLI_AUTH=instance_principal oci os ns get --output json >/dev/null || die 'Instance principal cannot access OCI Object Storage namespace.'
OCI_CLI_AUTH=instance_principal oci os object list --namespace "$namespace" --bucket-name "$bucket" --prefix "$prefix" --limit 1 >/dev/null || die 'Instance principal cannot list the requested bucket/prefix.'

# Create the restricted Cockpit login and local state directories.
id "$admin_user" &>/dev/null || useradd --create-home --groups wheel "$admin_user"
password="$(<"$admin_password_file")"; [[ -n "$password" ]] || die 'Password file is empty.'
printf '%s:%s\n' "$admin_user" "$password" | chpasswd; unset password
install -d -o root -g root -m 0750 /var/lib/tlog-replay/{archives,recordings} /etc/tlog-replay
cat > /etc/tlog-replay/config.env <<EOF
BUCKET_NAMESPACE='$namespace'
BUCKET_NAME='$bucket'
OBJECT_PREFIX='$prefix'
ACTIVE_CACHE_DAYS='$cache_days'
METADATA_DAYS='$metadata_days'
EOF
chmod 0600 /etc/tlog-replay/config.env

# Install one matched application/helper release and configure its archive constants.
install -d -o "$admin_user" -g "$admin_user" -m 0755 "/home/$admin_user/.local/share/cockpit/tlogreplay"
install -o "$admin_user" -g "$admin_user" -m 0644 "$asset_dir"/cockpit/* "/home/$admin_user/.local/share/cockpit/tlogreplay/"
cat > "/home/$admin_user/.local/share/cockpit/tlogreplay/manifest.json" <<'EOF'
{"version":0,"requires":{"cockpit":{"component":"cockpit"}}}
EOF
install -d -o "$admin_user" -g "$admin_user" -m 0755 "/home/$admin_user/.local/share/cockpit/tlogreplay/vendor"
sudo -u "$admin_user" -H npm install --prefix "/home/$admin_user/.local/share/cockpit/tlogreplay/vendor" --omit=dev --save-exact @xterm/xterm@5.5.0 @xterm/addon-fit@0.10.0 @xterm/addon-canvas@0.7.0
install -m 0750 "$asset_dir"/libexec/* /usr/local/libexec/
install -m 0750 "$asset_dir"/sbin/tlog-replay-sync /usr/local/sbin/tlog-replay-sync
sed -i "s|BUCKET, PREFIX = \"terminal-session-raw\", \"tlog-raw//\"|BUCKET, PREFIX = \"$bucket\", \"$prefix\"|;s/METADATA_RETENTION_DAYS = 365/METADATA_RETENTION_DAYS = $metadata_days/;s/LOCAL_CACHE_DAYS = 7/LOCAL_CACHE_DAYS = $cache_days/" /usr/local/sbin/tlog-replay-sync
sed -i "s|BUCKET = \"terminal-session-raw\"|BUCKET = \"$bucket\"|" /usr/local/libexec/tlog-replay-prepare

# Schedule archive indexing and expose Cockpit only to the approved source network.
cat > /etc/systemd/system/tlog-replay-sync.service <<EOF
[Unit]
Description=Synchronize TLOG Object Storage archives into the replay catalogue
After=network-online.target
OnFailure=tlog-replay-notify.service
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/tlog-replay-sync
EOF
cat > /etc/systemd/system/tlog-replay-sync.timer <<EOF
[Unit]
Description=Schedule TLOG replay synchronization
[Timer]
OnBootSec=2min
OnUnitActiveSec=${sync_minutes}min
Persistent=true
[Install]
WantedBy=timers.target
EOF
if [[ -n "$topic_ocid" ]]; then cat > /etc/systemd/system/tlog-replay-notify.service <<EOF
[Service]
Type=oneshot
ExecStart=/bin/bash -c 'OCI_CLI_AUTH=instance_principal oci ons message publish --topic-id "$topic_ocid" --title "TLOG replay sync failure" --body "tlog-replay-sync.service failed on %H"'
EOF
else cat > /etc/systemd/system/tlog-replay-notify.service <<'EOF'
[Service]
Type=oneshot
ExecStart=/usr/bin/true
EOF
fi
systemctl daemon-reload; systemctl enable --now cockpit.socket tlog-replay-sync.timer
firewall-cmd --permanent --add-rich-rule="rule family=ipv4 source address=$source_cidr port port=9090 protocol=tcp accept"
firewall-cmd --reload
echo "Deployment complete. Also allow TCP/9090 from $source_cidr in the VCN NSG/security list."
