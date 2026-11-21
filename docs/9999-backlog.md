---
brief: Deferred reliability work and business lifecycle decisions.
tags: [backlog, reliability, retention]
---

# Backlog

- [ ] Implement the business trash lifecycle. `pending_deletion` places the product/file
  in trash; a background process permanently deletes it after 30 days. Persist the
  trash entry timestamp, allow restore before expiry, and recheck the expected version
  before processing. File deletion must respect product references and remove every
  object revision only after eligibility is confirmed. Make retries idempotent, audit
  the operation, and test the retention boundary, restore/delete races and S3 failures.
  This is a requested future task; pending states currently do not start this work.
- [ ] Define the automatic archiving policy separately before enabling a processor
  for `pending_archiving` (retention, restore and effect on stored objects).
