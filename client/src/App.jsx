import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { PreferencesProvider } from "./context/PreferencesContext.jsx";
import { LanguageProvider } from "./context/LanguageContext.jsx";
import AppLayout from "./components/layout/AppLayout.jsx";
import ProtectedRoute from "./components/layout/ProtectedRoute.jsx";
import LoadingState from "./components/ui/LoadingState.jsx";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import DoctorLogin from "./pages/DoctorLogin.jsx";
import DoctorRegister from "./pages/DoctorRegister.jsx";

// Signed-in pages load on demand so the first screen stays light on
// low-powered kiosk hardware. The tracker in particular pulls in charts.
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const MedicalHistory = lazy(() => import("./pages/MedicalHistory.jsx"));
const HistoryDetail = lazy(() => import("./pages/HistoryDetail.jsx"));
const HistoryTaking = lazy(() => import("./pages/HistoryTaking.jsx"));
const Chat = lazy(() => import("./pages/Chat.jsx"));
const HealthTracker = lazy(() => import("./pages/HealthTracker.jsx"));
const Exercise = lazy(() => import("./pages/Exercise.jsx"));
const Ayurveda = lazy(() => import("./pages/Ayurveda.jsx"));
const Reminders = lazy(() => import("./pages/Reminders.jsx"));
const Documents = lazy(() => import("./pages/Documents.jsx"));
const Profile = lazy(() => import("./pages/Profile.jsx"));
const Appointments = lazy(() => import("./pages/Appointments.jsx"));

// Doctor pages
const DoctorDashboard = lazy(() => import("./pages/doctor/QueuePage.jsx"));
const PatientReportPage = lazy(() => import("./pages/doctor/PatientReportPage.jsx"));
const PrescriptionComposerPage = lazy(() => import("./pages/doctor/PrescriptionComposerPage.jsx"));
const PatientSearchPage = lazy(() => import("./pages/doctor/PatientSearchPage.jsx"));
const DoctorAppointmentsPage = lazy(() => import("./pages/doctor/AppointmentsPage.jsx"));
const DoctorRecordsPage = lazy(() => import("./pages/doctor/DoctorRecordsPage.jsx"));

function PublicOnly({ children }) {
  const { isAuthenticated, role, loading } = useAuth();
  if (loading) {
    return (
      <div className="page">
        <LoadingState message="Checking your sign-in…" />
      </div>
    );
  }
  if (isAuthenticated) {
    return <Navigate to={role === "doctor" ? "/doctor/dashboard" : "/dashboard"} replace />;
  }
  return children;
}

function DoctorProtectedRoute({ children }) {
  const { isAuthenticated, role, loading } = useAuth();
  if (loading) {
    return (
      <div className="page">
        <LoadingState message="Checking your sign-in…" />
      </div>
    );
  }
  if (!isAuthenticated || role !== "doctor") {
    return <Navigate to="/doctor/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <PreferencesProvider>
        <LanguageProvider>
          <BrowserRouter>
          <Suspense
            fallback={
              <div className="page">
                <LoadingState />
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Landing />} />

              {/* Patient auth */}
              <Route
                path="/login"
                element={
                  <PublicOnly>
                    <Login />
                  </PublicOnly>
                }
              />
              <Route
                path="/register"
                element={
                  <PublicOnly>
                    <Register />
                  </PublicOnly>
                }
              />

              {/* Doctor auth */}
              <Route
                path="/doctor/login"
                element={
                  <PublicOnly>
                    <DoctorLogin />
                  </PublicOnly>
                }
              />
              <Route
                path="/doctor/register"
                element={
                  <PublicOnly>
                    <DoctorRegister />
                  </PublicOnly>
                }
              />

              {/* Doctor navigation redirect */}
              <Route path="/doctor" element={<Navigate to="/doctor/dashboard" replace />} />

              {/* Doctor protected routes */}
              <Route
                path="/doctor/dashboard"
                element={
                  <DoctorProtectedRoute>
                    <DoctorDashboard />
                  </DoctorProtectedRoute>
                }
              />
              <Route
                path="/doctor/search"
                element={
                  <DoctorProtectedRoute>
                    <PatientSearchPage />
                  </DoctorProtectedRoute>
                }
              />
              <Route
                path="/doctor/appointments"
                element={
                  <DoctorProtectedRoute>
                    <DoctorAppointmentsPage />
                  </DoctorProtectedRoute>
                }
              />
              <Route
                path="/doctor/records"
                element={
                  <DoctorProtectedRoute>
                    <DoctorRecordsPage />
                  </DoctorProtectedRoute>
                }
              />
              <Route
                path="/doctor/session/:sessionId/report"
                element={
                  <DoctorProtectedRoute>
                    <PatientReportPage />
                  </DoctorProtectedRoute>
                }
              />
              <Route
                path="/doctor/session/:sessionId/prescribe"
                element={
                  <DoctorProtectedRoute>
                    <PrescriptionComposerPage />
                  </DoctorProtectedRoute>
                }
              />
              <Route
                path="/doctor/report/:sessionId"
                element={
                  <DoctorProtectedRoute>
                    <PatientReportPage />
                  </DoctorProtectedRoute>
                }
              />
              <Route
                path="/doctor/prescribe/:sessionId"
                element={
                  <DoctorProtectedRoute>
                    <PrescriptionComposerPage />
                  </DoctorProtectedRoute>
                }
              />

              {/* Patient protected */}
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="history" element={<MedicalHistory />} />
                <Route path="history/new" element={<HistoryTaking />} />
                <Route path="history/:sessionId" element={<HistoryDetail />} />
                <Route path="history/:sessionId/continue" element={<HistoryTaking />} />
                <Route path="chat" element={<Chat />} />
                <Route path="tracker" element={<HealthTracker />} />
                <Route path="exercise" element={<Exercise />} />
                <Route path="ayurveda" element={<Ayurveda />} />
                <Route path="reminders" element={<Reminders />} />
                <Route path="documents" element={<Documents />} />
                <Route path="profile" element={<Profile />} />
                <Route path="appointments" element={<Appointments />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        </LanguageProvider>
      </PreferencesProvider>
    </AuthProvider>
  );
}
