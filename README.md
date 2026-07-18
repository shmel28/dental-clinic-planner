# Dental Clinic Planner

A modern, full-stack scheduling and logistics management system designed specifically for dental clinics. This application helps clinic administrators plan, schedule, and optimize staff allocations across different treatment rooms and days of the week, with real-time logistical validation.

**Live Application**: [https://dental-clinic-planner.vercel.app/](https://dental-clinic-planner.vercel.app/)

---

## Core Features

- **Interactive Weekly Logistical Matrix**: Swapped axes layout (Days on Top, Rooms on Left) designed to fit perfectly on a standard desktop screen height without vertical scrolling.
- **Dynamic Staff Booking**: Quick-assign popup forms (`+ Book` buttons) to schedule Doctors, Hygienists, and Assistants into specific time ranges, with role-based visual color coding.
- **Smart Drag & Drop Rescheduling**: Native HTML5 drag-and-drop support allowing users to reschedule shift cards dynamically across room cells.
- **Global 'Copy Entire Week' Duplication**: Clone all active allocations from a source week into next week with a single click, including automated target week redirection and background conflict validation.
- **Compact Hover Day Duplication**: Clean cells by default, displaying a compact `📋 Copy Day` button upon hovering, which allows replicating single-room daily schedules to other days.
- **Global Toast Notification System**: Replaces browser `alert()` popups with elegant, non-blocking toast notifications in the top-right corner of the page (green for success, red for validation/scheduling conflicts, blue for info).
- **5-Step Onboarding Tutorial Tour**: Guided interactive tour powered by `react-joyride` that starts automatically for first-time users or can be replayed at any time using the `❓ Tour` header button.
- **Automation Preferences & Webhook Sync**: Toggle "WhatsApp Alerts" and "Google Calendar Sync" preferences next to staff members in the Resource Manager. Saves preferences to the SQLite database and triggers a POST request to an external `MAKE_WEBHOOK_URL` webhook (filtering out records for staff who have not opted in) upon explicit actions like saving resource manager changes or copying a week.

---

## Recent Major Updates

- **Database migration**: Transitioned to a Many-to-Many relationship (`allocation_staff`) to support multiple staff members per shift.
- **Advanced Validation Rules**: Implemented strict backend constraints for staff combinations (e.g., max 3 receptionists, strictly 1 Doctor + 1 Assistant in treatment rooms).
- **Double-Booking Prevention**: Added backend logic to prevent scheduling the same staff member in overlapping slots across different rooms.
- **Enhanced UI**: Added a 'Delete' button in the Quick Edit modal for easier shift management.
- **Improved Error Handling**: The frontend now intercepts and explicitly displays exact backend validation messages to the user.

---

## Tech Stack

### Frontend
- **React** (v19) with **TypeScript**
- **Vite** (Next-generation frontend tool)
- **Vanilla CSS** (Clinical SaaS design system)
- **React Joyride** (Onboarding guide engine)
- **Vercel Analytics** (Production audience analytics)

### Backend
- **FastAPI** (High-performance Python web framework)
- **Uvicorn** (ASGI server implementation)
- **SQLAlchemy** (SQL toolkit and Object-Relational Mapper)
- **SQLite** (Local database storage in `clinic.db`)
- **Requests** (HTTP client for webhook delivery)

---

## How to Run Locally

To run this project on your local machine, follow these steps:

### Prerequisites
- Node.js (v18 or higher recommended)
- Python (v3.10 or higher recommended)

### 1. Backend Setup
1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Install the Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Start the FastAPI development server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   The backend API will be running at `http://localhost:8000`.

### 2. Frontend Setup
1. Open a new terminal and navigate to the `frontend/` directory:
   ```bash
   cd frontend
   ```
2. Install the Node dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   The frontend application will be running at `http://localhost:5173`. Open this URL in your browser to view the application.

---

## Conflict & Validation Rules
The system enforces strict operational integrity during scheduling:
1. **Reception Room Constraints**: Maximum of 3 Receptionists. Maximum of 1 Receptionist (Recalls). No Doctors, Hygienists, or Assistants allowed.
2. **Treatment Room Constraints**: Maximum of 1 Doctor, 1 Hygienist, and 1 Assistant per slot. Cannot mix Doctors and Hygienists in the same slot. At least one main practitioner (Doctor or Hygienist) must be present.
3. **Double-Booking Prevention**: Practitioners cannot be double-booked at overlapping times in any room.
4. **Error Transparency**: When rules are violated, the API returns a 400 Bad Request with a clear explanation, which is displayed directly to the user in the frontend UI.
