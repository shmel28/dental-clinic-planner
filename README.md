# Dental Clinic Planner

A modern, full-stack scheduling and logistics management system designed specifically for dental clinics. This application helps clinic administrators plan, schedule, and optimize staff allocations across different treatment rooms and days of the week, with real-time logistical validation.

---

## Core Features

- **Interactive Weekly Logistical Matrix**: Swapped axes layout (Days on Top, Rooms on Left) designed to fit perfectly on a standard desktop screen height without vertical scrolling.
- **Dynamic Staff Booking**: Quick-assign popup forms (`+ Book` buttons) to schedule Doctors, Hygienists, and Assistants into specific time ranges, with role-based visual color coding.
- **Smart Drag & Drop Rescheduling**: Native HTML5 drag-and-drop support allowing users to reschedule shift cards dynamically across room cells.
- **Global 'Copy Entire Week' Duplication**: Clone all active allocations from a source week into next week with a single click, including automated target week redirection and background conflict validation.
- **Compact Hover Day Duplication**: Clean cells by default, displaying a compact `📋 Copy Day` button upon hovering, which allows replicating single-room daily schedules to other days.
- **Global Toast Notification System**: Replaces browser `alert()` popups with elegant, non-blocking toast notifications in the top-right corner of the page (green for success, red for validation/scheduling conflicts, blue for info).
- **5-Step Onboarding Tutorial Tour**: Guided interactive tour powered by `react-joyride` that starts automatically for first-time users or can be replayed at any time using the `❓ Tour` header button.

---

## Tech Stack

### Frontend
- **React** (v19) with **TypeScript**
- **Vite** (Next-generation frontend tool)
- **Vanilla CSS** (Clinical SaaS design system)
- **React Joyride** (Onboarding guide engine)

### Backend
- **FastAPI** (High-performance Python web framework)
- **Uvicorn** (ASGI server implementation)
- **SQLAlchemy** (SQL toolkit and Object-Relational Mapper)
- **SQLite** (Local database storage in `clinic.db`)

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
1. Receptionists cannot be allocated to treatment rooms (Room A/B/C/D).
2. Doctors, Hygienists, and Assistants cannot be allocated to the Reception area.
3. Practitioners cannot be double-booked at overlapping times.
4. Assistant-only shifts are blocked (every treatment room shift must have a lead practitioner).
