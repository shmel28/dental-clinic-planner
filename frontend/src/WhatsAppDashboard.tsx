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
    <div style={{ padding: "3rem", maxWidth: "1400px", margin: "0 auto" }}>
      <div className="filter-controls" style={{ marginBottom: "3rem" }}>
        <span className="brand-subtitle-badge" style={{ fontSize: "1.2rem", padding: "0.75rem 1.5rem", background: "#dcfce7", color: "#166534" }}>
          💬 WhatsApp Control Center
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3rem" }}>
        
        {/* Left Column: Preview & Action */}
        <div className="saas-panel" style={{ padding: "2rem" }}>
          <h3 style={{ marginTop: 0, marginBottom: "1rem", color: "#334155", fontSize: "1.5rem" }}>תצוגה מקדימה להודעה</h3>
          <p style={{ fontSize: "1rem", color: "#64748b", marginBottom: "1.5rem" }}>
            הבאקאנד יבנה הודעה מותאמת אישית לכל איש צוות המבוססת על המבנה הבא (כולל תוספות לשותפים או ריקולים):
          </p>
          
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "1.5rem", borderRadius: "0.5rem", fontFamily: "monospace", fontSize: "1rem", color: "#166534", marginBottom: "2.5rem", whiteSpace: "pre-wrap", lineHeight: "1.6" }}>
            שלום [Name], המשמרות שלך לתאריכים {startDate} עד {endDate} הן:
            {"\n\n"}
            2026-06-15 (08:00-12:00) בחדר עזרה ראשונה יחד עם: דניאל
            {"\n"}
            2026-06-16 (14:00-18:00) בחדר קבלה [אחראי/ת ריקולים]
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <button 
              className="btn-primary" 
              style={{ width: "100%", justifyContent: "center", padding: "1rem", fontSize: "1rem", background: "#22c55e", borderColor: "#16a34a" }}
              onClick={handleBroadcast}
              disabled={loading}
            >
              {loading ? "Broadcasting..." : `🚀 Publish Schedule & Send WhatsApps`}
            </button>
            
            <button 
              className="btn-primary" 
              style={{ width: "100%", justifyContent: "center", padding: "1rem", fontSize: "1rem", background: "#3b82f6", borderColor: "#2563eb" }}
              onClick={async () => {
                try {
                  setLoading(true);
                  setError("");
                  const res = await apiFetch(`/send-shift-reminders`, { method: "POST" });
                  const data = await res.json();
                  
                  if (data.statuses) {
                    setStatuses(data.statuses);
                  }
                  
                  if (!res.ok) throw new Error(data.detail || "Failed to send reminders");
                  
                  alert("תזכורות וואטסאפ (מחר) נשלחו, הסטטוסים עודכנו בטבלה!\n\n" + data.detail);
                } catch (err: any) {
                  alert("שגיאה בשליחת תזכורות:\n" + err.message);
                  setError(err.message);
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
            >
              שלח תזכורות וואטסאפ
            </button>
          </div>
          
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
