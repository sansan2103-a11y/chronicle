# Chronicle Release Gate - PROBE

This file exists so that the release pipeline can be exercised end to end
without touching product code and without moving the Pages version trio
(`version.txt` / `index.html` `BUILT` / `home.html` `HOME_BUILT`).

It is the only file under `pipeline/` that a normal (`kind: pages`) release is
allowed to write; everything else under `pipeline/` carries release-gate
authority and is hard denied. See `docs/PIPELINE_V1.md`.

Nothing loads, imports or serves this file. Changing it cannot change product
behaviour.

## Probe log

| probe | releaseId | note |
| --- | --- | --- |
| - | - | no probe release has been applied yet |
