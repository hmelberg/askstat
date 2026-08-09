---
id: src-eu-lfs
name: EU Labour Force Survey
public_microdata: open, no registration — but EXPLICITLY restricted to training/methods exploration, NOT population inference
scientific_use_file: "application; eligible: universities, research institutes, NSIs, central banks within the EU, plus the ECB"
gotcha: ISCO-88→ISCO-08 (~2011) and NACE Rev.1→Rev.2 (~2008) break long series
---

# EU Labour Force Survey (EU-LFS)

The EU's harmonised individual/household labour-force microdata. The open
public-use files are training/methods-exploration only — genuine
population-inference work needs the Scientific Use File application
route, a distinct access path from the generic Eurostat dissemination
API.



ISCO-88→ISCO-08 (~2011) and NACE Rev.1→Rev.2 (~2008) break long series —
flag the break rather than pooling silently across it.

