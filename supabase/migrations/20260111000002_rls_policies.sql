-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_summaries ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PROFILES POLICIES
-- ============================================

-- Users can read their own profile
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- Users can insert their own profile (on signup)
CREATE POLICY "Users can insert own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- ============================================
-- PATIENTS POLICIES
-- ============================================

-- Patients can read their own data
CREATE POLICY "Patients can view own data"
    ON patients FOR SELECT
    USING (auth.uid() = id);

-- Patients can update their own data
CREATE POLICY "Patients can update own data"
    ON patients FOR UPDATE
    USING (auth.uid() = id);

-- Patients can insert their own data
CREATE POLICY "Patients can insert own data"
    ON patients FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Doctors can read patient data IF consent exists
CREATE POLICY "Doctors can view patients with consent"
    ON patients FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM consent_requests cr
            INNER JOIN doctors d ON d.id = cr.doctor_id
            WHERE cr.patient_id = patients.id
              AND d.id = auth.uid()
              AND cr.status = 'approved'
              AND (cr.expires_at IS NULL OR cr.expires_at > NOW())
        )
    );

-- ============================================
-- DOCTORS POLICIES
-- ============================================

-- Doctors can read their own data
CREATE POLICY "Doctors can view own data"
    ON doctors FOR SELECT
    USING (auth.uid() = id);

-- Doctors can update their own data
CREATE POLICY "Doctors can update own data"
    ON doctors FOR UPDATE
    USING (auth.uid() = id);

-- Doctors can insert their own data
CREATE POLICY "Doctors can insert own data"
    ON doctors FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Patients can read doctor info (public directory)
CREATE POLICY "Patients can view doctor profiles"
    ON doctors FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'patient')
    );

-- ============================================
-- CONSENT_REQUESTS POLICIES
-- ============================================

-- Patients can view their own consent requests
CREATE POLICY "Patients can view own consent requests"
    ON consent_requests FOR SELECT
    USING (auth.uid() = patient_id);

-- Doctors can view their own consent requests
CREATE POLICY "Doctors can view own consent requests"
    ON consent_requests FOR SELECT
    USING (auth.uid() = doctor_id);

-- Doctors can insert consent requests
CREATE POLICY "Doctors can create consent requests"
    ON consent_requests FOR INSERT
    WITH CHECK (auth.uid() = doctor_id);

-- Patients can update consent status (approve/deny)
CREATE POLICY "Patients can respond to consent requests"
    ON consent_requests FOR UPDATE
    USING (auth.uid() = patient_id);

-- ============================================
-- RECORDS POLICIES
-- ============================================

-- Patients can view their own records
CREATE POLICY "Patients can view own records"
    ON records FOR SELECT
    USING (auth.uid() = patient_id);

-- Patients can insert their own records
CREATE POLICY "Patients can upload own records"
    ON records FOR INSERT
    WITH CHECK (auth.uid() = patient_id AND auth.uid() = uploaded_by);

-- Doctors can view records IF consent exists
CREATE POLICY "Doctors can view records with consent"
    ON records FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM consent_requests cr
            WHERE cr.patient_id = records.patient_id
              AND cr.doctor_id = auth.uid()
              AND cr.status = 'approved'
              AND (cr.expires_at IS NULL OR cr.expires_at > NOW())
        )
    );

-- Doctors can insert records IF they have read_write consent
CREATE POLICY "Doctors can upload records with write consent"
    ON records FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM consent_requests cr
            WHERE cr.patient_id = records.patient_id
              AND cr.doctor_id = auth.uid()
              AND cr.status = 'approved'
              AND cr.access_type = 'read_write'
              AND (cr.expires_at IS NULL OR cr.expires_at > NOW())
        )
        AND auth.uid() = uploaded_by
    );

-- ============================================
-- AUDIT_LOGS POLICIES
-- ============================================

-- Only service role can insert audit logs
CREATE POLICY "Service role only for audit logs"
    ON audit_logs FOR INSERT
    WITH CHECK (false); -- Enforced via service role key in Edge Functions

-- Users can view their own audit logs (optional)
CREATE POLICY "Users can view own audit logs"
    ON audit_logs FOR SELECT
    USING (auth.uid() = actor_id);

-- ============================================
-- CHAT_SUMMARIES POLICIES
-- ============================================

-- Patients can view their own chat summaries
CREATE POLICY "Patients can view own chat summaries"
    ON chat_summaries FOR SELECT
    USING (auth.uid() = patient_id);

-- Service role can insert/update chat summaries
CREATE POLICY "Service role can manage chat summaries"
    ON chat_summaries FOR ALL
    USING (false) -- Managed via Edge Functions with service role
    WITH CHECK (false);
