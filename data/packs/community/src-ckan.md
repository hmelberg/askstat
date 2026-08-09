---
id: src-ckan
kind: catalog software family
api_pattern: GET https://{portal}/api/3/action/package_search?q=<terms>&rows=10
other_actions: [package_show, resource_show, datastore_search]
auth: none for read
deployments: [catalog.data.gov, data.gov.uk, hundreds of national/city portals]
---

# CKAN

The catalog software family behind government open-data portals such as
data.gov and data.gov.uk, plus hundreds of national and city portals —
query any CKAN deployment's package_search API directly. Open, no key
needed for read access.



`package_search` is the entry point; `resource_show`/`datastore_search` on
a hit's resource id gets you to the actual file or queryable table. The
same API shape works on any CKAN deployment — swap `{portal}` for the host
you found via a registry or by name.

