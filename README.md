# Secure Patient Document Service

Simple REST API for managing patient documents with role-based access control. Built with Node.js, TypeScript, Express, and PostgreSQL.

## How to run

**Prerequisites:** Node.js 18+ and PostgreSQL running locally.

```bash
npm install

# Create the database (if it doesn't exist yet)
psql -U postgres -c "CREATE DATABASE patient_docs;"

# Start dev server
npm run dev
```

Server runs on http://localhost:3000. It creates the documents table automatically on startup.

You can also build and run the compiled version:
```bash
npm run build
npm start
```

### With Docker (recommended)

```bash
docker compose up --build -d
```

This starts both the API (port 3000) and PostgreSQL (port 5432). No local Postgres needed.

## Testing with curl

Auth is simulated through headers, so you can test like this:

```bash
# Upload a document as a doctor
curl -X POST http://localhost:3000/documents \
  -H "x-user-id: doctor-1" \
  -H "x-user-role: doctor" \
  -F "patientId=patient-1" \
  -F "file=@test.pdf"

# List my documents as a patient
curl http://localhost:3000/documents \
  -H "x-user-id: patient-1" \
  -H "x-user-role: patient"

# Get specific document as admin
curl http://localhost:3000/documents/<uuid-here> \
  -H "x-user-id: admin-1" \
  -H "x-user-role: admin"
```

## Assumptions

- Auth is simulated via headers instead of real JWT. In production you'd verify a real token.
- S3 is mocked — files go to a local `uploads/` folder. The storage module can be swapped for real S3 without changing the rest of the app.
- No user table. Users come from the decoded token, we just trust the id and role.
- No pagination on the list endpoint (would add it with more time).
- HTTPS handled at infra level (load balancer), not in the app.

## Trade-offs

- **Local storage vs real S3:** Simpler for dev and testing. The `storage.ts` abstracts this so switching to real S3 is just changing one file.
- **Raw SQL vs ORM:** Went with raw pg queries to keep it simple and avoid extra dependencies. For a bigger project Prisma would be nicer.
- **Table creation on startup vs migrations:** Using `CREATE TABLE IF NOT EXISTS` on startup. Works fine here but in production you'd want proper migrations.
- **Zod for validation:** Lightweight and works well with TypeScript. Validates patientId on upload and UUID format on document retrieval.
- **Logging:** Winston writes to local files (`logs/`) and optionally to CloudWatch when credentials are present. Audit events go to a separate stream. Locally the files are enough for dev; in production CloudWatch handles retention and alerting.

## What I'd improve with more time

- Real JWT auth with token verification
- Pre-signed S3 URLs for secure file download
- Pagination on list endpoint
- Audit log table in DB (in addition to file/CloudWatch logs)
- Rate limiting
- Tests (unit + integration)
- Proper DB migrations (e.g. with node-pg-migrate)

---

## Short Questions

### 1. Data Protection
I'd encrypt at two levels: at rest (RDS encryption for the database, S3 SSE for files — so data on disk is unreadable without keys) and in transit (HTTPS between client and server, SSL for DB connections). This way both stored and moving data are protected.

### 2. Access Control
When a doctor queries documents, the SQL filters by `doctor_id = user.id`. So they literally only get their own documents back. On GET by id, I check that the document's doctor_id matches the current user's id — if not, 403. A doctor never sees another doctor's data.

### 3. File Storage
S3 bucket is private, no public access. When someone needs to download, the API checks their permissions first, then generates a pre-signed URL that expires in a few minutes. The client uses that URL to download directly from S3. After it expires, the URL is useless.

### 4. Auditing
I have a dedicated audit logger (separate from app logs) that records every document access: who (user id + role), what (action + document id), and when (timestamp). In production this goes to its own CloudWatch log group with restricted access. Locally it writes to `logs/audit.log`. Combined with CloudTrail for infra events, you get full traceability.

### 5. Incident Scenario
If a DB snapshot leaks, RDS encryption means the data is encrypted with KMS keys the attacker doesn't have. Also the DB only stores metadata (ids, file keys) — the actual files are in S3, a completely separate system. And UUIDs as IDs make it hard to guess or enumerate anything.

### 6. Spec-Driven Development
It makes you think about what you're building before you start coding. You catch issues early (like "wait, can a patient upload too?" — no, only doctors). It also gives you a checklist to build against, and serves as documentation after.

### 7. Working with AI
You feed the spec as context and ask the AI to implement specific parts. The spec acts as the source of truth — you can check the AI's output against it. Without a spec the AI might interpret things differently than what you need.

### 8. Ambiguity
If I can ask someone, I ask. If I can't (like in a timed exam), I pick the most reasonable interpretation, document the assumption clearly, and move on. Getting stuck is worse than making a reasonable choice and being transparent about it.

### 9. PHI Handling
The documents are the most obvious PHI — could be lab results, diagnoses, etc. But the metadata is also sensitive: knowing patient X visited a cardiologist reveals health info. Both need encryption, access control, and audit logging. File contents should never appear in logs.

### 10. Logging
Never log: file contents, patient names or personal data, auth tokens, anything that identifies a patient's condition. Logs tend to be accessible to many people (devs, ops) and stored in less secure systems. PHI in logs = accidental data leak. That's why the audit logger only records opaque IDs, never the actual data.

### 11. Compliance
For production healthcare: real auth with MFA, a BAA with AWS, comprehensive audit logging, data retention/deletion policies, regular security audits, employee training, incident response procedures, network isolation with VPCs and security groups, automated dependency scanning.
