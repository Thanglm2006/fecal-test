import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5175, // Thay đổi số 3000 thành port bạn muốn (ví dụ: 4000, 8080)
    host: '0.0.0.0',
    allowedHosts: [
      'test.job-fs.me', // Thêm domain của bạn vào đây
      '.job-fs.me'      // Hoặc dùng dấu chấm ở đầu để cho phép tất cả subdomain
    ]
  },
})

