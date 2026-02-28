-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom types
CREATE TYPE user_role AS ENUM ('patient', 'doctor');
CREATE TYPE consent_status AS ENUM ('pending', 'approved', 'denied', 'expired');
CREATE TYPE access_type AS ENUM ('read', 'read_write');
CREATE TYPE record_type AS ENUM ('prescription', 'lab_report', 'imaging', 'discharge_summary', 'vaccination', 'other');

-- Profiles table (extends auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role user_role NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Patients table
CREATE TABLE patients (
    id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    health_id TEXT UNIQUE NOT NULL,
    encrypted_dek TEXT, -- Encrypted Data Encryption Key
    pin_salt TEXT,
    pin_hash TEXT,
    qr_token TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Doctors table
CREATE TABLE doctors (
    id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    hospital TEXT,
    license_id TEXT,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Consent requests table
CREATE TABLE consent_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    status consent_status DEFAULT 'pending',
    access_type access_type DEFAULT 'read',
    reason TEXT,
    expires_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(patient_id, doctor_id, status)
);

-- Records table (IPFS metadata)
CREATE TABLE records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES profiles(id),
    record_type record_type NOT NULL,
    title TEXT NOT NULL,
    record_date DATE NOT NULL,
    doctor_name TEXT,
    notes TEXT,
    ipfs_cid TEXT NOT NULL,
    sha256_hash TEXT NOT NULL,
    encrypted_metadata JSONB, -- Contains encrypted file info
    file_size_bytes INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit logs (immutable, service role only)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID NOT NULL REFERENCES profiles(id),
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id UUID,
    metadata JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat summaries cache (optional optimization)
CREATE TABLE chat_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL,
    language TEXT DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour')
);

-- Indexes for performance
CREATE INDEX idx_patients_health_id ON patients(health_id);
CREATE INDEX idx_patients_qr_token ON patients(qr_token);
CREATE INDEX idx_consent_patient_doctor ON consent_requests(patient_id, doctor_id);
CREATE INDEX idx_consent_status ON consent_requests(status);
CREATE INDEX idx_records_patient ON records(patient_id);
CREATE INDEX idx_records_date ON records(record_date DESC);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_chat_summaries_patient ON chat_summaries(patient_id);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_doctors_updated_at BEFORE UPDATE ON doctors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_consent_requests_updated_at BEFORE UPDATE ON consent_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_records_updated_at BEFORE UPDATE ON records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate unique health_id
CREATE OR REPLACE FUNCTION generate_health_id()
RETURNS TEXT AS $$
DECLARE
    new_id TEXT;
    done BOOLEAN;
BEGIN
    done := FALSE;
    WHILE NOT done LOOP
        new_id := 'MHC' || LPAD(FLOOR(RANDOM() * 1000000000)::TEXT, 9, '0');
        done := NOT EXISTS(SELECT 1 FROM patients WHERE health_id = new_id);
    END LOOP;
    RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- Function to check consent validity
CREATE OR REPLACE FUNCTION check_consent(p_patient_id UUID, p_doctor_id UUID, p_access_type access_type)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM consent_requests
        WHERE patient_id = p_patient_id
          AND doctor_id = p_doctor_id
          AND status = 'approved'
          AND (expires_at IS NULL OR expires_at > NOW())
          AND (p_access_type = 'read' OR access_type = 'read_write')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to auto-expire consents
CREATE OR REPLACE FUNCTION expire_old_consents()
RETURNS void AS $$
BEGIN
    UPDATE consent_requests
    SET status = 'expired'
    WHERE status = 'approved'
      AND expires_at IS NOT NULL
      AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Scheduled job for expiring consents (run via pg_cron or Edge Function)
-- This is a placeholder; actual scheduling done via Supabase cron or external scheduler
