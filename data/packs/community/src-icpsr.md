# ICPSR

A large social-science data archive — tens of thousands of studies and
250,000+ files. Most studies need only a free account and click-through;
restricted-use files need a Data Use Agreement or a secure enclave.

```yaml
- id: src-icpsr
  name: ICPSR
  scale: "tens of thousands of studies, 250,000+ files"
  ⚠_deprecation: "legacy OAI-PMH/DDI-XML bulk export was RETIRED, guaranteed only 'until at least August 2026' — may already be gone. Do not build new integrations on it."
  current_api: https://icpsr.github.io/metadata/icpsr_metadata_api/
  access: "free account + click-through for most studies; restricted-use needs a DUA or enclave"
```

The legacy OAI-PMH/DDI-XML bulk export is retired (guaranteed only until at
least August 2026, may already be gone) — do not build new integrations on
it; use the current metadata API instead.
