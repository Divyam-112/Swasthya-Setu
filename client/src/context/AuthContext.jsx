import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  getCurrentPatient,
  loginPatient,
  registerPatient,
  getCurrentDoctor,
  loginDoctor as loginDoctorApi,
  registerDoctor as registerDoctorApi,
} from "../api/auth.js";
import { onUnauthorized, setToken, getToken } from "../api/client.js";

const AuthContext = createContext(null);

/**
 * Decode a JWT payload without verifying (client-side only).
 * Returns { id, role } or null.
 */
function decodeTokenPayload(token) {
  try {
    const base64 = token.split(".")[1];
    const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [patient, setPatient] = useState(null);
  const [doctor, setDoctor] = useState(null);
  const [role, setRole] = useState(null); // "patient" | "doctor" | null
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      // Support magic token in URL (e.g. ?token=...)
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const urlToken = searchParams.get("token");
        if (urlToken) {
          setToken(urlToken);
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete("token");
          window.history.replaceState({}, "", cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
        }
      } catch {}

      const token = getToken();
      if (!token) {
        setLoading(false);
        return;
      }

      const payload = decodeTokenPayload(token);
      const savedRole = payload?.role;

      try {
        if (savedRole === "doctor") {
          const response = await getCurrentDoctor();
          if (!cancelled) {
            setDoctor(response.data.doctor);
            setRole("doctor");
          }
        } else {
          const response = await getCurrentPatient();
          if (!cancelled) {
            setPatient(response.data.patient);
            setRole("patient");
          }
        }
      } catch {
        if (!cancelled) {
          setPatient(null);
          setDoctor(null);
          setRole(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () =>
      onUnauthorized(() => {
        setPatient(null);
        setDoctor(null);
        setRole(null);
      }),
    [],
  );

  const value = useMemo(
    () => ({
      patient,
      doctor,
      role,
      loading,
      user: role === "doctor" ? doctor : patient,
      isAuthenticated: Boolean(patient || doctor),

      async login(abhaId, password) {
        const response = await loginPatient({ abhaId, password });
        setToken(response.data.token);
        setPatient(response.data.patient);
        setRole("patient");
        return response.data.patient;
      },

      async register(payload) {
        const response = await registerPatient(payload);
        setToken(response.data.token);
        setPatient(response.data.patient);
        setRole("patient");
        return response.data.patient;
      },

      async loginDoctor(email, password) {
        const response = await loginDoctorApi({ email, password });
        setToken(response.data.token);
        setDoctor(response.data.doctor);
        setRole("doctor");
        return response.data.doctor;
      },

      async registerDoctor(payload) {
        const response = await registerDoctorApi(payload);
        setToken(response.data.token);
        setDoctor(response.data.doctor);
        setRole("doctor");
        return response.data.doctor;
      },

      logout() {
        setToken(null);
        setPatient(null);
        setDoctor(null);
        setRole(null);
      },

      setPatient,
      setDoctor,
    }),
    [patient, doctor, role, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
