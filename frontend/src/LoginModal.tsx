import React, { useState } from "react";
import { apiFetch, setAuthToken } from "./api";

interface LoginModalProps {
  onSuccess: () => void;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onSuccess, onClose }) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await apiFetch("/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      
      setAuthToken(data.access_token);
      onSuccess();
    } catch (err: any) {
      console.error("Login fetch error:", err);
      if (err instanceof TypeError && err.message === "Failed to fetch") {
         console.error("Network or CORS error. API_BASE_URL might be unreachable from this client.");
      }
      setError(err.message || "Failed to log in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: "400px", padding: "2rem" }}>
        <div className="modal-header" style={{ borderBottom: "none", paddingBottom: 0, justifyContent: "center" }}>
          <h2 className="modal-title" style={{ fontSize: "1.5rem", fontWeight: "bold" }}>Admin Access</h2>
        </div>
        
        <p style={{ textAlign: "center", color: "#64748b", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
          Enter the admin password to modify the schedule.
        </p>

        {error && (
          <div style={{ backgroundColor: "#fef2f2", color: "#b91c1c", padding: "0.75rem", borderRadius: "0.5rem", marginBottom: "1rem", fontSize: "0.875rem", border: "1px solid #fecaca", textAlign: "center" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              style={{ width: "100%", boxSizing: "border-box" }}
              placeholder="••••••••"
              autoFocus
              required
            />
          </div>
          
          <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              style={{ flex: 1, padding: "0.75rem", backgroundColor: "#f1f5f9", color: "#475569", border: "none" }}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{ flex: 1, padding: "0.75rem", justifyContent: "center" }}
              disabled={loading}
            >
              {loading ? "Verifying..." : "Login"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
