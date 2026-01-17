import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'save-categories',
      configureServer(server) {
        server.middlewares.use('/api/save', (req, res, next) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
              body += chunk.toString();
            });
            req.on('end', () => {
              try {
                const parsed = JSON.parse(body);
                // Adjust path as needed. Assuming project root is where vite runs.
                const filePath = path.resolve(process.cwd(), 'src/data/categories.json');

                // Ensure directory exists (it should)
                fs.writeFileSync(filePath, JSON.stringify(parsed, null, 4));
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true }));
              } catch (e) {
                console.error('Failed to save file', e);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Failed to save file' }));
              }
            });
          } else {
            next();
          }
        });
      }
    }
  ],
})
