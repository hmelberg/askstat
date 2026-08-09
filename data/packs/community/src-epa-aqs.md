---
id: src-epa-aqs
name: EPA Air Quality System
unit: monitor-day/hour reading
coverage: US, 1957 (sparse) - present, dense from the 1980s
access: open pre-generated files; free email-registered API
gotcha: the AQS key is issued to an email by an EPA process, not an instant self-service token
---

# EPA Air Quality System

Monitor-day/hour air-quality readings across the US, open via
pre-generated files with a free email-registered API for query access.



The AQS API key is issued to an email address by an EPA process — it is
not an instant self-service token, so build in a "credentials pending"
wait rather than failing silently.

