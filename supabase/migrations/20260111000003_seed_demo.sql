-- Demo seed data for testing
-- WARNING: Use only in development. Remove for production.

-- Demo password: "Demo@1234"
-- Create demo patient
DO $$
DECLARE
    demo_patient_id UUID;
    demo_doctor_id UUID;
    demo_health_id TEXT;
BEGIN
    -- Insert demo patient user
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
    VALUES (
        '11111111-1111-1111-1111-111111111111',
        'patient@demo.com',
        crypt('Demo@1234', gen_salt('bf')),
        NOW(),
        NOW(),
        NOW()
    ) ON CONFLICT DO NOTHING;

    demo_patient_id := '11111111-1111-1111-1111-111111111111';
    demo_health_id := generate_health_id();

    -- Insert profile
    INSERT INTO profiles (id, role, full_name, phone)
    VALUES (demo_patient_id, 'patient', 'Demo Patient', '+911234567890')
    ON CONFLICT DO NOTHING;

    -- Insert patient
    INSERT INTO patients (id, health_id, qr_token)
    VALUES (
        demo_patient_id,
        demo_health_id,
        encode(gen_random_bytes(32), 'hex')
    ) ON CONFLICT DO NOTHING;

    -- Insert demo doctor user
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
    VALUES (
        '22222222-2222-2222-2222-222222222222',
        'doctor@demo.com',
        crypt('Demo@1234', gen_salt('bf')),
        NOW(),
        NOW(),
        NOW()
    ) ON CONFLICT DO NOTHING;

    demo_doctor_id := '22222222-2222-2222-2222-222222222222';

    -- Insert profile
    INSERT INTO profiles (id, role, full_name, phone)
    VALUES (demo_doctor_id, 'doctor', 'Dr. Demo Singh', '+919876543210')
    ON CONFLICT DO NOTHING;

    -- Insert doctor
    INSERT INTO doctors (id, hospital, license_id, verified)
    VALUES (demo_doctor_id, 'AIIMS Nagpur', 'MH-12345', TRUE)
    ON CONFLICT DO NOTHING;

    -- Create a demo consent request
    INSERT INTO consent_requests (patient_id, doctor_id, status, access_type, reason, expires_at)
    VALUES (
        demo_patient_id,
        demo_doctor_id,
        'approved',
        'read_write',
        'Routine checkup',
        NOW() + INTERVAL '7 days'
    ) ON CONFLICT DO NOTHING;

    -- Create demo record
    INSERT INTO records (
        patient_id,
        uploaded_by,
        record_type,
        title,
        record_date,
        doctor_name,
        notes,
        ipfs_cid,
        sha256_hash,
        encrypted_metadata
    ) VALUES (
        demo_patient_id,
        demo_patient_id,
        'lab_report',
        'Blood Test Results',
        CURRENT_DATE - 7,
        'Dr. Demo Singh',
        'Routine checkup - all parameters normal',
        'QmDemo1234567890abcdefghijklmnopqrstuv',
        'a' || md5(random()::text),
        '{"filename": "blood_test_encrypted.pdf", "size": 245678}'::jsonb
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Demo data seeded successfully!';
    RAISE NOTICE 'Patient: patient@demo.com / Demo@1234';
    RAISE NOTICE 'Doctor: doctor@demo.com / Demo@1234';
    RAISE NOTICE 'Health ID: %', demo_health_id;
END $$;
