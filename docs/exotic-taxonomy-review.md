# Exotic matrix taxonomy differences

These 24 codes are absent from the bundled taxonomy. All 24 occur unchanged in the locally downloaded eBird API v2025 snapshot (17,891 taxa, as recorded in `local/taxonomy-meta.local.json`). This comparison identifies a taxonomy version mismatch, not invalid matrix codes. It does not verify a newer online release. No codes have been renamed and the production taxonomy is unchanged.

| Code       | Matrix name                                             | v2025 category | Counts as species      |
| ---------- | ------------------------------------------------------- | -------------- | ---------------------- |
| `x01218`   | Plumed x White-faced Whistling-Duck (hybrid)            | hybrid         | No: hybrid             |
| `x01176`   | Emperor x Snow Goose (hybrid)                           | hybrid         | No: hybrid             |
| `x01178`   | Wood Duck x Brazilian Teal (hybrid)                     | hybrid         | No: hybrid             |
| `crebob24` | Crested Bobwhite (Colombian)                            | issf           | Rolls up to `crebob1`  |
| `x01185`   | American x Greater Flamingo (hybrid)                    | hybrid         | No: hybrid             |
| `hadibi6`  | Hadada Ibis (Eastern)                                   | issf           | Rolls up to `hadibi1`  |
| `lither1`  | Little Heron (African)                                  | issf           | Rolls up to `strher1`  |
| `grhowl18` | Great Horned Owl (Northern)                             | issf           | Rolls up to `grhowl`   |
| `x01193`   | Long-billed Corella x Sulphur-crested Cockatoo (hybrid) | hybrid         | No: hybrid             |
| `bkclor1`  | Black-capped Lory (Vogelkop)                            | issf           | Rolls up to `blclor1`  |
| `bkclor2`  | Black-capped Lory (Biak)                                | issf           | Rolls up to `blclor1`  |
| `bkclor8`  | Black-capped Lory (Northern)                            | issf           | Rolls up to `blclor1`  |
| `bkclor6`  | Black-capped Lory (Southern)                            | issf           | Rolls up to `blclor1`  |
| `bkclor7`  | Black-capped Lory (Fly River)                           | issf           | Rolls up to `blclor1`  |
| `y01351`   | Monk/Cliff Parakeet                                     | slash          | No: slash              |
| `relpar2`  | Red-lored Amazon (Red-lored)                            | issf           | Rolls up to `relpar10` |
| `relpar8`  | Red-lored Amazon (Salvin's)                             | issf           | Rolls up to `relpar10` |
| `bntpar16` | Brown-throated Parakeet (Colombian)                     | issf           | Rolls up to `brtpar1`  |
| `bntpar17` | Brown-throated Parakeet (Gold-faced)                    | issf           | Rolls up to `brtpar1`  |
| `bntpar18` | Brown-throated Parakeet (Venezuelan)                    | issf           | Rolls up to `brtpar1`  |
| `bntpar19` | Brown-throated Parakeet (Amazonian)                     | issf           | Rolls up to `brtpar1`  |
| `silver10` | Silvereye (Cinnamon-flanked)                            | issf           | Rolls up to `silver3`  |
| `rebfir10` | Red-browed Firetail (Gray-vented)                       | issf           | Rolls up to `rebfir1`  |
| `dobfin3`  | Double-barred Finch (White-rumped)                      | issf           | Rolls up to `dobfin1`  |

There are five hybrids, one slash identification and 18 subspecies/groups. The latter use the reviewed taxonomy’s `reportAs` relationship, never a guessed code replacement. In particular, `relpar2` and `relpar8` report as `relpar10` in v2025, whereas the older bundled `relpar10` itself reports as `relpar`. Copying aliases into the old taxonomy would mix taxonomic concepts. A separate coherent taxonomy update and re-import is needed to adopt the v2025 identities.
