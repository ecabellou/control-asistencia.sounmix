import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Scanner from './pages/Scanner';
import Reports from './pages/Reports';
import Login from './pages/Login';

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <AdminLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="trabajadores" element={<Employees />} />
          <Route path="reportes" element={<Reports />} />
          <Route path="escaner" element={<Scanner />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
