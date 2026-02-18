# SPEC — Secure Patient Document Service

## Overview

A simple backend service that lets doctors upload medical documents for patients, and controls who can see what based on their role. Files are stored in S3, metadata goes in PostgreSQL.

---

## Entities

### User (simulated from token)

| Field | Type                              | Notes                        |
|-------|-----------------------------------|------------------------------|
| id    | string (UUID)                     | Unique user identifier       |
| role  | 'admin' \| 'doctor' \| 'patient' | Determines access privileges |

Users are not stored in our database. We receive them already decoded from the auth token in each request.

### Document

| Field     | Type      | Notes                                      |
|-----------|-----------|---------------------------------------------|
| id        | UUID      | Auto-generated primary key                  |
| patientId | string    | References the patient this document is for |
| doctorId  | string    | The doctor who uploaded the document        |
| fileKey   | string    | S3 object key (not a public URL)            |
| createdAt | timestamp | Auto-generated on creation                  |

---

## API Endpoints

### POST /documents

Upload a new document.

- **Who can use it:** `admin`, `doctor`
- **Body:** multipart form with file + `patientId`
- **What it does:**
  1. Validates the input (patientId is required, file must be present)
  2. Uploads the file to S3
  3. Saves metadata to the database (patientId, doctorId from the logged-in user, fileKey from S3)
  4. Returns the created document metadata
- **Notes:** A doctor uploads on behalf of a patient. The `doctorId` is taken from the authenticated user, not from the request body. Patients cannot upload.

### GET /documents

List documents the current user has access to.

- **Who can use it:** `admin`, `doctor`, `patient`
- **What it returns depends on role:**
  - `admin` → all documents
  - `doctor` → only documents where `doctorId` matches their user id
  - `patient` → only documents where `patientId` matches their user id
- **Returns:** Array of document metadata (no file content)

### GET /documents/:id

Get a single document's metadata.

- **Who can use it:** `admin`, `doctor`, `patient`
- **Access rules:**
  - `admin` → can access any document
  - `doctor` → only if `doctorId === user.id`
  - `patient` → only if `patientId === user.id`
- **Returns:** Document metadata. Optionally a pre-signed S3 URL to download the file.

---

## Access Rules (RBAC)

| Action             | admin | doctor                         | patient                        |
|--------------------|-------|--------------------------------|--------------------------------|
| Upload document    | Yes   | Yes (becomes the doctorId)     | No                             |
| List documents     | All   | Only their own (by doctorId)   | Only their own (by patientId)  |
| View one document  | Any   | Only if they are the doctorId  | Only if they are the patientId |

Authorization is checked at the service/middleware level before any data is returned.

---

## Assumptions

- **Auth is simulated:** There's no real JWT verification. We assume a middleware injects the `User` object (id + role) into the request, as if a token was already decoded. For development/testing, we'll pass user info via headers (e.g., `x-user-id` and `x-user-role`).
- **No user registration:** Users are not managed by this service. We only care about the id and role that come from the token.
- **One file per document:** Each document record maps to exactly one file in S3.
- **S3 can be mocked:** If we can't connect to real AWS, we'll use a local mock (like a local folder or an S3 mock library) so the app still works.
- **No pagination for now:** The GET /documents endpoint returns all accessible documents. In a real scenario you'd add pagination, but for this scope it's not needed.
- **File types:** We won't restrict file types for simplicity, but in production you'd validate and limit to PDFs, images, etc.
- **No frontend:** This is API-only. Testing is done via tools like curl or Postman.
- **HTTPS in production:** We assume TLS is handled at the infrastructure level (load balancer), not in the app code itself.
