import 'dotenv/config';
import http from 'http';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApiApp, getPublicSiteSettings, injectSiteMetaIntoHtml } from './serverApp.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = createApiApp();
  const httpServer = http.createServer(app);

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
        ws: { server: httpServer },
      },
      appType: 'spa',
    });

    app.use(async (req: Request, res: Response, next) => {
      if (
        req.method !== 'GET' ||
        req.path.startsWith('/api/') ||
        req.path.startsWith('/@') ||
        req.path.includes('.') ||
        !req.headers.accept?.includes('text/html')
      ) {
        next();
        return;
      }

      try {
        const indexPath = path.resolve(__dirname, 'index.html');
        const rawHtml = fs.readFileSync(indexPath, 'utf8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, rawHtml);
        const settings = await getPublicSiteSettings();
        const origin = `${req.protocol}://${req.get('host') || `localhost:${PORT}`}`;
        res.status(200).set({ 'Content-Type': 'text/html' }).end(injectSiteMetaIntoHtml(transformed, settings, origin));
      } catch (err) {
        next(err);
      }
    });

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir, { index: false }));
    app.get('*', async (req: Request, res: Response) => {
      try {
        const htmlPath = path.join(distDir, 'index.html');
        const rawHtml = fs.readFileSync(htmlPath, 'utf8');
        const settings = await getPublicSiteSettings();
        const origin = `${req.protocol}://${req.get('host') || `localhost:${PORT}`}`;
        res.status(200).set({ 'Content-Type': 'text/html' }).end(injectSiteMetaIntoHtml(rawHtml, settings, origin));
      } catch {
        res.sendFile(path.join(distDir, 'index.html'));
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`ClipIndex server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
