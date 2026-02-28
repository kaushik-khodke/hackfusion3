import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import { Navbar } from "@/components/layout/Navbar";
import { Landing } from "@/pages/Landing";
import { Login } from "@/pages/auth/Login";
import { Signup } from "@/pages/auth/Signup";
import { useAuth } from "@/hooks/useAuth";

// Lazy load pages for better performance
const PatientDashboard = React.lazy(() =>
  import("@/pages/patient/Dashboard").then((module) => ({ default: module.default }))
);
const Records = React.lazy(() => import("@/pages/patient/Records"));
const PatientConsent = React.lazy(() => import("./pages/patient/Consent"));
const Analysis = React.lazy(() =>
  import("@/pages/patient/Analysis").then((module) => ({ default: module.Analysis }))
);
const PharmacyChat = React.lazy(() =>
  import("@/pages/patient/PharmacyChat").then((module) => ({ default: module.PharmacyChat }))
);

const Chat = React.lazy(() =>
  import("@/pages/patient/Chat").then((module) => ({ default: module.Chat }))
);
const DoctorDashboard = React.lazy(() => import("@/pages/doctor/Dashboard"));
const Scan = React.lazy(() =>
  import("@/pages/doctor/Scan").then((module) => ({ default: module.Scan }))
);
const PatientView = React.lazy(() =>
  import("@/pages/doctor/PatientView").then((module) => ({ default: module.PatientView }))
);

const PharmacistDashboard = React.lazy(() => import("@/pages/pharmacist/Dashboard"));

const ResetPassword = React.lazy(() =>
  import("@/pages/auth/ResetPassword").then((module) => ({ default: module.ResetPassword }))
);
const UpdatePassword = React.lazy(() =>
  import("@/pages/auth/UpdatePassword").then((module) => ({ default: module.UpdatePassword }))
);

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;

  return <React.Suspense fallback={<LoadingSpinner />}>{children}</React.Suspense>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;

  return <React.Suspense fallback={<LoadingSpinner />}>{children}</React.Suspense>;
}

function DashboardRouter() {
  const { role, loading } = useAuth();

  if (loading) return <LoadingSpinner />;

  if (role === "doctor") return <DoctorDashboard />;
  if (role === "pharmacist") return <Navigate to="/pharmacist/dashboard" replace />;

  // Default fallback if profile is loaded but no other role matched (implies patient)
  return <PatientDashboard />;
}

function App() {
  return (
    <Router>
      <div className="min-h-screen text-foreground">
        <Navbar />
        <main className="pt-16 min-h-screen relative">
          <Routes>
            {/* Public routes */}
            <Route
              path="/"
              element={
                <PublicRoute>
                  <Landing />
                </PublicRoute>
              }
            />
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              }
            />
            <Route
              path="/signup"
              element={
                <PublicRoute>
                  <Signup />
                </PublicRoute>
              }
            />
            <Route
              path="/reset-password"
              element={
                <PublicRoute>
                  <ResetPassword />
                </PublicRoute>
              }
            />
            <Route
              path="/update-password"
              element={
                <UpdatePassword />
              }
            />

            {/* Protected routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardRouter />
                </ProtectedRoute>
              }
            />

            {/* Patient */}
            <Route
              path="/patient/records"
              element={
                <ProtectedRoute>
                  <Records />
                </ProtectedRoute>
              }
            />
            <Route
              path="/patient/consent"
              element={
                <ProtectedRoute>
                  <PatientConsent />
                </ProtectedRoute>
              }
            />
            <Route
              path="/patient/chat"
              element={
                <ProtectedRoute>
                  <Chat />
                </ProtectedRoute>
              }
            />
            <Route
              path="/patient/analysis"
              element={
                <ProtectedRoute>
                  <Analysis />
                </ProtectedRoute>
              }
            />

            {/* Doctor */}
            <Route
              path="/patient/pharmacy-chat"
              element={
                <ProtectedRoute>
                  <PharmacyChat />
                </ProtectedRoute>
              }
            />
            <Route
              path="/doctor/scan"
              element={
                <ProtectedRoute>
                  <Scan />
                </ProtectedRoute>
              }
            />
            <Route
              path="/doctor/patient/:patientId"
              element={
                <ProtectedRoute>
                  <PatientView />
                </ProtectedRoute>
              }
            />

            {/* Pharmacist */}
            <Route
              path="/pharmacist/dashboard"
              element={
                <ProtectedRoute>
                  <PharmacistDashboard />
                </ProtectedRoute>
              }
            />

            {/* 404 */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;