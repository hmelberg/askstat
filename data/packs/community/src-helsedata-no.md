# Helsedata.no / Helsedataservice

Norway's application portal for individual-level health-registry
microdata. Delivery is always to a secure enclave — TSD, SAFE or HUNT
Cloud — never a raw file by email, and requires REK ethics approval, a
GDPR legal basis (Art. 6 + Art. 9) and a DPIA.

```yaml
id: src-helsedata-no
name: Helsedata.no / Helsedataservice
provider: Helsedataservice, part of FHI
landing: https://helsedata.no/
registry_catalog: https://helsedata.no/no/datakilder/
delivery: "secure enclave — TSD (UiO), SAFE (UiB), or HUNT Cloud (NTNU). Never a raw file by email."
timelines: {anonymous_aggregated: "official max 30 working days, realistic 3-4 months", personally_identifiable: "official max 60 working days (linked/multi-register), realistic ~6 months — requires REK approval, GDPR Art.6+Art.9 legal basis, a DPIA"}
pricing: {base_fee: "NOK 1,500 excl. VAT single source / NOK 3,000 multiple sources", hourly: "NOK 1,155/hour excl. VAT (2024 rate, UNVERIFIED for 2026)", typical_totals: "NOK 10,000-30,000 single source; NOK 25,000-60,000 complex linkage"}
foreign_researchers: "a Norwegian institutional data controller and legal basis are effectively required — UNVERIFIED exact wording"
```

Registries reachable through this one portal (each keeps its own coverage
years and quirks — quote the specifics, do not assume uniformity): Norsk
pasientregister (NPR), KUHR, Reseptregisteret/NorPD, Legemiddelregisteret
(LMR), Medisinsk fødselsregister (MFR), Dødsårsaksregisteret,
Kreftregisteret, Hjerte- og karregisteret, MoBa and CONOR — see the
nordic-microdata overview's "Other sources" section for each registry's
coverage and caveats.
