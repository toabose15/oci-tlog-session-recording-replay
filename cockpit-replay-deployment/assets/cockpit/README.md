# Cockpit application

This directory contains the static Cockpit application files installed by the
replay deployer. The application presents recording search results, invokes the
approved replay helpers, and renders terminal playback for an authenticated
Cockpit user.

Deploy these files only through `../../deploy-cockpit-replay.sh`. Keep the UI
and the privileged helpers in `../libexec/` at compatible versions.
