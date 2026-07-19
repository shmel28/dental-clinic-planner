export const API_BASE_URL = import.meta.env.PROD ? import.meta.env.VITE_API_URL : "http://localhost:8000/api";

export const getAuthToken = () => localStorage.getItem("admin_token");
export const setAuthToken = (token: string) => localStorage.setItem("admin_token", token);
export const clearAuthToken = () => localStorage.removeItem("admin_token");

export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const token = getAuthToken();
  
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const config: RequestInit = {
    ...options,
    headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
  
  if (response.status === 401) {
    clearAuthToken();
    window.dispatchEvent(new Event("auth-expired"));
    throw new Error("Session expired. Please log in again.");
  }
  
  if (!response.ok) {
    let errorDetail = "An error occurred";
    try {
      const errorData = await response.json();
      errorDetail = errorData.detail || errorDetail;
    } catch (e) {
      // JSON parse failed
    }
    throw new Error(errorDetail);
  }

  if (response.status === 204) {
    return response;
  }

  return response;
};
