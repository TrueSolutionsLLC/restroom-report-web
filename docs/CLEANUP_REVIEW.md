# Live station cleanup review

Prepared October 8, 2026. This document proposes a separate production data repair; no repair has been run.

All 24 candidates retain exact mock counts and CleanScores. The source fixtures explicitly use representative placeholder addresses. Correcting the totals alone does not establish that each stop is a real, correctly located restroom.

## Required review before writes

1. Verify each station identity, address and coordinates against the actual location. Record any duplicate or incorrectly linked station.
2. Preserve the two candidates with actual review documents and review their station linkage before removing or merging anything. Do not delete traveler reviews or move contributions automatically.
3. Export the candidate station documents and affected review/photo linkage into a recoverable backup using authorized Firebase access. Keep private account data outside public artifacts.
4. Produce exact before/after patches from fresh server reads. Valid locations with zero reviews should be Unrated with zero scores/count and no review timestamp; retain latest actual issue-report time if present, otherwise remove the report timestamp. Photo counts must come from persisted photos. For locations with real reviews, recalculate from those reviews after linkage is confirmed.
5. Review and approve the resulting patches and rollback plan. Deploy the tested backend safeguards before applying the repair. Verify both clients afterward.

The station-only audit is evidence of the mismatch, not a production backup. The new aggregation code and disabled seeding endpoint have not been deployed.

## Candidate inventory

| Station ID | Public name | Stored ratings | Actual ratings | Stored sample score |
|---|---|---:|---:|---:|
| `station-bp-florissant` | BP | 17 | 0 | 6.1 |
| `station-caseys-chesterfield` | Casey's General Store | 21 | 1 | 5.8 |
| `station-circlek-maplewood` | Circle K | 14 | 0 | 4.6 |
| `station-faststop-hazelwood` | Fast Stop | 12 | 0 | 4.9 |
| `station-flyingj-collinsville` | Flying J Travel Plaza | 38 | 0 | 6.9 |
| `station-loves-ofallon` | Love's Travel Stop #456 | 47 | 0 | 8.6 |
| `station-loves-wentzville` | Love's Travel Stop #312 | 71 | 1 | 9.1 |
| `station-loves-wrightcity` | Love's Travel Stop #289 | 44 | 0 | 8.4 |
| `station-maverik-kirkwood` | Maverik | 41 | 0 | 8 |
| `station-mobil-manchester` | Mobil | 25 | 0 | 6.6 |
| `station-motomart-affton` | Moto Mart | 16 | 0 | 5.2 |
| `station-petro-granitecity` | Petro Stopping Center | 33 | 0 | 6.2 |
| `station-phillips66-clayton` | Phillips 66 | 24 | 0 | 7.2 |
| `station-pilot-fairviewheights` | Pilot Travel Center | 9 | 0 | 3.4 |
| `station-pilot-kingdomcity` | Pilot Travel Center | 51 | 0 | 7 |
| `station-pilot-stcharles` | Pilot Travel Center | 62 | 0 | 7.8 |
| `station-quiktrip-downtown` | QuikTrip #1478 | 89 | 0 | 8.2 |
| `station-racetrac-edwardsville` | RaceTrac | 22 | 0 | 6.8 |
| `station-roadranger-columbia` | Road Ranger Travel Center | 48 | 0 | 7.5 |
| `station-sapp-peruque` | Sapp Bros Travel Center | 34 | 0 | 7.3 |
| `station-shell-brentwood` | Shell | 28 | 0 | 7.4 |
| `station-speedway-belleville` | Speedway | 19 | 0 | 5.5 |
| `station-ta-oakgrove` | TA Travel Center | 39 | 0 | 6.5 |
| `station-ta-troy` | TA Travel Center | 55 | 0 | 7.1 |

Ordered and unordered review counts agreed for all 97 stations. The audit contains no traveler IDs or review text. Existing accounts split across different Firebase UIDs need their own identity-confirmed reconciliation; this station repair does not merge accounts.
