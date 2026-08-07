# Enhetsregisteret (Norway)

Norway's business register — open, keyless API and bulk download.

```yaml
- id: src-bronnoysund
  name: Enhetsregisteret (Norway)
  access: open, no key
  api_base: https://data.brreg.no/enhetsregisteret/api
  bulk: ["/api/enheter/lastned (JSON)", "/api/enheter/lastned/csv"]
  gotcha: "search capped at 10,000 results — use bulk endpoints for a full extract; accounting figures live in a separate dataset (Regnskapsregisteret)"
```

Search is capped at 10,000 results — use the bulk endpoints for a full
extract. Accounting figures live in a separate dataset
(Regnskapsregisteret).
