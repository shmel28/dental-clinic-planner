import React, { useState, useEffect } from "react";
import { apiFetch } from "./api";
import { QRCodeSVG } from 'qrcode.react';

interface WhatsAppDashboardProps {
  startDate: string;
  endDate: string;
}

interface Staff {
  id: number;
  name: string;
  role: string;
  whatsapp_enabled: boolean;
  phone_number?: string;
}

export const WhatsAppDashboard: React.FC<WhatsAppDashboardProps> = ({ startDate, endDate }) => {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // Track loading and success state per individual staff member
  const [loadingIndividual, setLoadingIndividual] = useState<Record<number, boolean>>({});
  const [sentIndividual, setSentIndividual] = useState<Record<number, boolean>>({});

  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);

  const fetchQR = async () => {
    setQrLoading(true);
    try {
      const res = await fetch("https://dental-clinic-planner-e897.onrender.com/api/whatsapp/qr");
      const data = await res.json();
      if (data.connected) {
        setIsConnected(true);
        setQrCode(null);
      } else if (data.qr) {
        setQrCode(data.qr);
        setIsConnected(false);
      } else {
        setQrCode(null);
        setIsConnected(false);
      }
    } catch (err: any) {
      console.error("Failed to fetch QR", err);
    } finally {
      setQrLoading(false);
    }
  };

  useEffect(() => {
    const fetchStaff = async () => {
      try {
        const res = await apiFetch("/staff");
        const data = await res.json();
        setStaffList(data);
      } catch (err: any) {
        console.error("Failed to load staff list", err);
      }
    };
    fetchStaff();
  }, []);

  const handleBroadcast = async () => {
    if (!window.confirm(`Are you sure you want to broadcast the schedule for ${startDate} to ${endDate} to all opted-in staff?`)) return;
    
    setLoading(true);
    setError("");
    
    try {
      const res = await apiFetch(`/whatsapp/broadcast-week?start_date=${startDate}&end_date=${endDate}`, {
        method: "POST"
      });
      const data = await res.json();
      
      if (data.statuses && data.statuses.length === 0) {
        setError("No staff members are scheduled or opted-in for WhatsApp notifications during this week.");
      } else {
        alert("Weekly reminders sent successfully!");
      }
    } catch (err: any) {
      setError(err.message || "Failed to broadcast messages.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendIndividual = async (staffId: number) => {
    setLoadingIndividual(prev => ({ ...prev, [staffId]: true }));
    setError("");
    
    try {
      const res = await apiFetch(`/whatsapp/send-individual?staff_id=${staffId}`, { method: "POST" });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.detail || "Failed to send individual reminder");
      
      setSentIndividual(prev => ({ ...prev, [staffId]: true }));
    } catch (err: any) {
      setError(`שגיאה בשליחת תזכורת: ${err.message}`);
    } finally {
      setLoadingIndividual(prev => ({ ...prev, [staffId]: false }));
    }
  };

  // Filter staff to show only those who have whatsapp enabled
  const optedInStaff = staffList.filter(s => s.whatsapp_enabled);

  return (
    <div style={{ padding: "2rem", width: "100%", margin: "0 auto", height: "calc(100vh - 120px)" }}>
      
      <div style={{ display: "grid", gridTemplateColumns: "350px 1fr", gap: "2rem", height: "100%" }}>
        
        {/* Left Column: Preview & Global Action */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div className="saas-panel" style={{ padding: "2rem", width: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }} dir="rtl">
            <h3 style={{ marginTop: 0, marginBottom: "1rem", color: "#334155", fontSize: "1.4rem", textAlign: "right" }}>תצוגה מקדימה להודעה</h3>
            <p style={{ fontSize: "1rem", color: "#64748b", marginBottom: "1.5rem", textAlign: "right" }}>
              הבאקאנד יבנה הודעה מותאמת אישית לכל איש צוות המבוססת על המבנה הבא:
            </p>
            
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "1.5rem", borderRadius: "0.75rem", fontFamily: "monospace", fontSize: "1rem", color: "#166534", whiteSpace: "pre-wrap", lineHeight: "1.6", textAlign: "right", flexGrow: 1 }}>
              שלום [שם], המשמרות שלך לתאריכים יום ב ה-15.06 עד יום ו ה-19.06 הן:
              {"\n\n"}
              יום ב ה-15.06 (08:00-12:00) בחדר עזרה ראשונה יחד עם: דניאל
              {"\n"}
              יום ג ה-16.06 (14:00-18:00) בחדר קבלה [אחראי/ת ריקולים]
            </div>
            
            {error && (
              <div style={{ marginTop: "1rem", padding: "1rem", background: "#fef2f2", color: "#b91c1c", borderRadius: "0.5rem", fontSize: "0.95rem", textAlign: "right" }}>
                {error}
              </div>
            )}
          </div>

          <div className="saas-panel" style={{ padding: "1.5rem", width: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <h3 style={{ marginTop: 0, marginBottom: "1rem", color: "#334155", fontSize: "1.3rem" }}>WhatsApp Connection</h3>
            
            {isConnected ? (
              <div style={{ padding: "1rem", background: "#dcfce7", color: "#166534", borderRadius: "0.5rem", width: "100%", textAlign: "center", fontWeight: "bold" }}>
                ✅ Connected to WhatsApp
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
                <button 
                  className="btn-primary" 
                  style={{ padding: "0.8rem", fontSize: "1rem" }}
                  onClick={fetchQR}
                  disabled={qrLoading}
                >
                  {qrLoading ? "Generating..." : "Generate QR Code"}
                </button>
                
                {qrCode && (
                  <div style={{ padding: "1rem", background: "white", borderRadius: "10px", border: "1px solid #cbd5e1" }}>
                    <QRCodeSVG value={qrCode} size={200} />
                  </div>
                )}
                {!qrCode && !qrLoading && (
                  <p style={{ color: "#64748b", fontSize: "0.9rem", textAlign: "center" }}>
                    If it doesn't show up immediately, try generating again in a few seconds while the service initializes.
                  </p>
                )}
              </div>
            )}
          </div>

          <button 
            className="btn-primary" 
            style={{ padding: "1rem", fontSize: "1rem", background: "#22c55e", borderColor: "#16a34a", borderRadius: "12px", width: "100%", justifyContent: "center" }}
            onClick={handleBroadcast}
            disabled={loading}
          >
            {loading ? "Broadcasting..." : `🚀 Send Weekly Reminder to Everyone`}
          </button>
        </div>

        {/* Right Column: Scrollable Staff List */}
        <div className="saas-panel" style={{ padding: "2rem", width: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", maxHeight: "75vh" }} dir="rtl">
          <h3 style={{ marginTop: 0, marginBottom: "1rem", color: "#334155", fontSize: "1.5rem", textAlign: "right", flexShrink: 0 }}>רשימת אנשי צוות למשלוח</h3>
          <p style={{ fontSize: "1.1rem", color: "#64748b", marginBottom: "1.5rem", textAlign: "right", flexShrink: 0 }}>
            שלח תזכורת באופן ידני ופרטני עבור המשמרות של מחר.
          </p>
          
          <div className="table-responsive" style={{ overflowY: "auto", flexGrow: 1, paddingRight: "0.5rem" }}>
            <table className="manager-table" style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <thead style={{ position: "sticky", top: 0, background: "#ffffff", zIndex: 1 }}>
                <tr>
                  <th style={{ width: "33%", padding: "1rem", textAlign: "right", fontSize: "1.1rem", borderBottom: "2px solid #cbd5e1" }}>שם איש צוות</th>
                  <th style={{ width: "33%", padding: "1rem", textAlign: "right", fontSize: "1.1rem", borderBottom: "2px solid #cbd5e1" }}>מספר טלפון</th>
                  <th style={{ width: "33%", padding: "1rem", textAlign: "right", fontSize: "1.1rem", borderBottom: "2px solid #cbd5e1" }}>פעולה (משמרות מחר)</th>
                </tr>
              </thead>
              <tbody>
                {optedInStaff.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", color: "#94a3b8", padding: "3rem", fontSize: "1.1rem" }}>
                      אין אנשי צוות שפעילים לוואטסאפ במערכת.
                    </td>
                  </tr>
                ) : (
                  optedInStaff.map((staff) => (
                    <tr key={staff.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "1rem", textAlign: "right", fontSize: "1.1rem", verticalAlign: "middle" }}>{staff.name}</td>
                      <td style={{ padding: "1rem", textAlign: "right", fontSize: "1.1rem", verticalAlign: "middle" }} dir="ltr">{staff.phone_number || "N/A"}</td>
                      <td style={{ padding: "1rem", textAlign: "right", verticalAlign: "middle" }}>
                        {sentIndividual[staff.id] ? (
                          <span style={{ 
                            display: "inline-block",
                            padding: "0.6rem 1.2rem", 
                            borderRadius: "0.5rem", 
                            fontSize: "1rem",
                            fontWeight: "bold",
                            background: "#dcfce7",
                            color: "#166534"
                          }}>
                            ✅ נשלח
                          </span>
                        ) : (
                          <button 
                            className="btn-primary" 
                            style={{ padding: "0.6rem 1.2rem", fontSize: "1rem", background: "#3b82f6", borderColor: "#2563eb", borderRadius: "8px" }}
                            onClick={() => handleSendIndividual(staff.id)}
                            disabled={loadingIndividual[staff.id]}
                          >
                            {loadingIndividual[staff.id] ? "שולח..." : "שלח תזכורת למחר"}
                          </button>
                        )}
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
