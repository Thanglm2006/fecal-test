import { useState } from 'react';
import axios from 'axios';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLoginEmployer = async (e) => {
    e.preventDefault();
    try {
      // Giả sử API login của bạn là /api/auth/login/employer hoặc applicant
      // Ở đây test nhanh mình gọi login Employer
      const res = await axios.post('http://localhost:8080/api/auth/login/employer', {
        email,
        password
      });

      if (res.data.status === 'success') {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('userId', JSON.stringify(res.data.user.id)); // Lưu thông tin user
        window.location.href = '/chat';
      }
    } catch (err) {
      alert('Login failed: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleLoginApplicant = async (e) => {
    e.preventDefault();
    try {
      // Giả sử API login của bạn là /api/auth/login/employer hoặc applicant
      // Ở đây test nhanh mình gọi login Employer
      const res = await axios.post('http://localhost:8080/api/auth/login/applicant', {
        email,
        password
      });

      if (res.data.status === 'success') {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('userId', JSON.stringify(res.data.user.id)); // Lưu thông tin user
        window.location.href = '/chat';
      }
    } catch (err) {
      alert('Login failed: ' + (err.response?.data?.message || err.message));
    }
  };
  return (
    <div className="h-screen flex items-center justify-center bg-gray-100">
      <form className="bg-white p-8 rounded shadow-md w-96">
        <h2 className="text-2xl font-bold mb-6 text-center">Chat Login</h2>
        <input
          type="email"
          placeholder="Email"
          className="w-full p-2 mb-4 border rounded"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          className="w-full p-2 mb-6 border rounded"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button onClick={handleLoginApplicant} type="submit" className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600">
          login applicant
        </button>

        <button onClick={handleLoginEmployer} type="submit" className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600">
          login employer
        </button>
      </form>
    </div>
  );
}
