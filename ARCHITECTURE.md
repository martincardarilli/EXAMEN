# ARCHITECTURE

## How I'd deploy this in AWS

The idea is pretty standard:

**ECS Fargate** for the API — containerize the Node app, push the image to ECR, and let Fargate run it. No need to manage EC2 instances.

**RDS PostgreSQL** for the database. Managed Postgres, so AWS takes care of backups and patches. The important part is putting it in a **private subnet** so it's not reachable from the internet.

**S3** for storing the actual files. Bucket is private (Block Public Access on). Files are never served directly — the API checks permissions first and can generate pre-signed URLs with short expiration.

**ALB** in front of ECS handles HTTPS termination (TLS cert from ACM). This is the only public-facing piece.

**CloudTrail** enabled to log AWS API calls for auditing.

Network layout:

```
Internet → ALB (public subnet, HTTPS) → ECS (private subnet) → RDS + S3 (private)
```

## Encryption

**At rest:**
- RDS encryption enabled via KMS — covers data, backups, snapshots
- S3 server-side encryption (SSE-S3 or SSE-KMS)

**In transit:**
- HTTPS everywhere. Client → ALB uses TLS 1.2+
- ECS → RDS with `sslmode=require`
- ECS → S3 is HTTPS by default through the AWS SDK

## Access control (IAM)

The ECS task has a scoped IAM role with only:
- `s3:PutObject` and `s3:GetObject` on the specific bucket
- Network access to RDS
- Read access to Secrets Manager

Nothing more. If the container gets compromised, the damage is limited.

## Secrets

DB passwords, keys, etc. go in **AWS Secrets Manager**. The app reads them at startup. Nothing sensitive in the repo. The `.env` is only for local dev.

## Auditing

Three layers:

- **Audit logger (app level):** A dedicated winston logger that writes every PHI access event (create, read, list, access denied) to `logs/audit.log` locally and to a separate CloudWatch log group (`patient-docs-audit`) in production. Each entry includes: action, actor id, actor role, document id, patient id, timestamp. This log group gets stricter IAM permissions — only security/compliance people can read it.
- **App logger (app level):** General operational logs (requests, errors, auth events) go to `logs/combined.log` and a separate CloudWatch log group. Useful for debugging but doesn't mix with auditing.
- **Infra level:** CloudTrail captures all AWS API activity (S3 access, RDS queries, IAM changes).

Logs never include file contents, patient names, or auth tokens — only opaque IDs.

## HIPAA considerations

PHI in this system = the documents themselves + metadata linking patients to documents. Everything encrypted at rest and in transit, access restricted by role, and all access is logged.

If a DB snapshot leaks: encryption at rest means the data is unreadable without KMS keys. Plus the DB only has metadata — the actual files are in S3 separately.

What should NOT go in logs: file contents, patient names, anything that identifies someone's health situation.

For breach response: check audit logs to understand scope, identify what was accessed, notify affected parties, and patch the vulnerability.

## Scaling

- **ECS** scales horizontally — more container instances behind the ALB, can auto-scale on CPU/request count
- **RDS** scales vertically or with read replicas
- **S3** scales on its own

Main bottleneck: DB connections when you have many containers. Solution is RDS Proxy or PgBouncer. For large uploads, pre-signed URLs let clients upload straight to S3.
