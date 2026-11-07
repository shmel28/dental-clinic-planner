import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import MyShifts from './MyShifts.tsx'

// A worker's personal link (?shifts=<token>) opens only their read-only shifts page
const shiftsToken = new URLSearchParams(window.location.search).get('shifts')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {shiftsToken ? <MyShifts token={shiftsToken} /> : <App />}
  </StrictMode>,
)
