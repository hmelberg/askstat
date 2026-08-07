# ECB Household Finance and Consumption Survey (HFCS)

True microdata on household wealth, debt, income and consumption across
the euro area, with waves in 2010, 2014, 2017 and 2021. Access requires
an application (government photo ID, English CV, request form).

```yaml
- id: src-hfcs
  name: ECB Household Finance and Consumption Survey
  kind: TRUE MICRODATA — household wealth, debt, income, consumption
  waves: [2010, 2014, 2017, 2021]
  access: "application — government photo ID, English CV, request form"
  ⚠: "5 multiply-imputed implicates per country-wave — variance needs Rubin's rules; several countries oversample wealthy households"
```

Each country-wave ships 5 multiply-imputed implicates — variance
estimation needs Rubin's rules, and several countries oversample wealthy
households.
