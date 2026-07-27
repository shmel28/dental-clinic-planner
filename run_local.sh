#!/bin/bash

echo "Cleaning up existing processes on ports 8000, 5173, 5174, 5175..."
for port in 8000 5173 5174 5175; do
  pid=$(lsof -ti :$port 2>/dev/null)
  if [ ! -z "$pid" ]; then
    echo "Killing process(es) $pid on port $port"
    kill -9 $pid 2>/dev/null
  fi
done

echo "Starting FastAPI backend..."
# Run uvicorn from the root directory so Python path matches the production Render environment
uvicorn backend.main:app --reload --port 8000 &
BACKEND_PID=$!

echo "Starting React frontend (Vite)..."
cd frontend
eval "$(conda shell.bash hook)" && conda deactivate
npm run dev &
FRONTEND_PID=$!
cd ..

echo "=================================================="
echo "Both servers are running!"
echo "Backend is running on http://localhost:8000"
echo "Frontend is running (check terminal for Vite URL)"
echo "Press Ctrl+C to stop both servers."
echo "=================================================="

# Trap SIGINT (Ctrl+C) to gracefully stop both servers when you close the script
trap "echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID; exit" SIGINT SIGTERM

# Wait indefinitely to keep the script alive
wait
