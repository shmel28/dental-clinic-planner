import React, { useState } from "react";
import { apiFetch } from "./api";

interface WhatsAppDashboardProps {
  startDate: string;
  endDate: string;
}

interface DeliveryStatus {
  staff_id: number;
  name: string;
  phone: string;
  status: string;
}

export const WhatsAppDashboard: React.FC<WhatsAppDashboardProps> = ({ startDate, endDate }) => {
  const [statuses, setStatuses] = useState<DeliveryStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleBroadcast = async () => {
    if (!window.confirm(`Are you sure you want to broadcast the schedule for ${startDate} to ${endDate} to all opted-in staff?`)) return;
    
    setLoading(true);
    setError("");
    
    try {
      const res = await apiFetch(`/whatsapp/broadcast-week?start_date=${startDate}&end_date=${endDate}`, {
        method: "POST"
      });
      const data = await res.json();
      setStatuses(data.statuses || []);
      
      if (data.statuses && data.statuses.length === 0) {
        setError("No staff members are scheduled or opted-in for WhatsApp notifications during this week.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to broadcast messages.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "1000px", margin: "0 auto" }}>
      <div className="filter-controls" style={{ marginBottom: "2rem" }}>
        <span className="brand-subtitle-badge" style={{ fontSize: "1rem", padding: "0.5rem 1rem", background: "#dcfce7", color: "#166534" }}>
          💬 WhatsApp Control Center
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
        
        {/* Left Column: Preview & Action */}
        <div className="saas-panel" style={{ padding: "1.5rem" }}>
          <h3 style={{ marginTop: 0, marginBottom: "1rem", color: "#334155" }}>Message Preview</h3>
          <p style={{ fontSize: "0.875rem", color: "#64748b", marginBottom: "1rem" }}>
            The backend will dynamically compile a message based on this template for each scheduled staff member.
          </p>
          
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "1rem", borderRadius: "0.5rem", fontFamily: "monospace", fontSize: "0.875rem", color: "#166534", marginBottom: "2rem", whiteSpace: "pre-wrap" }}>
            Hello [Staff Name], your schedule for {startDate} to {endDate} is:
            {"\n\n"}
            2026-06-15 (08:00-12:00) in Room 1
            {"\n"}
            2026-06-16 (14:00-18:00) in Room 2
          </div>

          <button 
            className="btn-primary" 
            style={{ width: "100%", justifyContent: "center", padding: "1rem", fontSize: "1rem", background: "#22c55e", borderColor: "#16a34a" }}
            onClick={handleBroadcast}
            disabled={loading}
          >
            {loading ? "Broadcasting..." : `🚀 Publish Schedule & Send WhatsApps`}
          </button>
          
          {error && (
            <div style={{ marginTop: "1rem", padding: "0.75rem", background: "#fef2f2", color: "#b91c1c", borderRadius: "0.5rem", fontSize: "0.875rem" }}>
              {error}
            </div>
          )}
        </div>

        {/* Right Column: Delivery Status Table */}
        <div className="saas-panel" style={{ padding: "1.5rem" }}>
          <h3 style={{ marginTop: 0, marginBottom: "1rem", color: "#334155" }}>Delivery Status</h3>
          <p style={{ fontSize: "0.875rem", color: "#64748b", marginBottom: "1rem" }}>
            Status of the last batch broadcast for the selected week.
          </p>
          
          <div className="table-responsive">
            <table className="manager-table">
              <thead>
                <tr>
                  <th>Staff Name</th>
                  <th>Phone Number</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {statuses.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", color: "#94a3b8", padding: "2rem" }}>
                      No messages sent yet.
                    </td>
                  </tr>
                ) : (
                  statuses.map((status, idx) => (
                    <tr key={idx}>
                      <td>{status.name}</td>
                      <td>{status.phone}</td>
                      <td>
                        <span style={{ 
                          padding: "0.25rem 0.5rem", 
                          borderRadius: "9999px", 
                          fontSize: "0.75rem",
                          fontWeight: "bold",
                          background: status.status === "Sent Successfully" ? "#dcfce7" : "#fef2f2",
                          color: status.status === "Sent Successfully" ? "#166534" : "#b91c1c"
                        }}>
                          {status.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};
