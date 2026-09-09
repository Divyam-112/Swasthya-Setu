import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import LoadingState from "../ui/LoadingState.jsx";

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="page">
        <LoadingState message="Checking your sign-in…" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  // If a doctor somehow lands on a patient-only route, redirect to doctor dashboard
  if (role === "doctor") {
    return <Navigate to="/doctor/dashboard" replace />;
  }

  return children;
}
