---
id: src-ncvs
name: National Crime Victimization Survey
unit: household, person, incident (three linked files)
coverage: US national, 1992-2024 redesigned series; legacy to 1973
access: open (public-use); some supplements need ICPSR restricted agreement
gotcha: excludes homicide; replicate weights required; redesigned 2016 — do not pool naively across the break; merge household/person on YEARQ+IDHH
---

# NCVS — National Crime Victimization Survey

A household/person/incident-level survey of criminal victimization in the
US, open public-use with some supplements needing an ICPSR restricted
agreement. Excludes homicide by design.



Use the replicate weights for variance estimation, and merge the
household and person files on YEARQ+IDHH. The 2016 redesign is a real
break — do not pool pre/post naively.

