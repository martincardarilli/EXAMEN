CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS documents (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id VARCHAR(255) NOT NULL,
  doctor_id  VARCHAR(255) NOT NULL,
  file_key   VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_patient_id ON documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_documents_doctor_id ON documents(doctor_id);
