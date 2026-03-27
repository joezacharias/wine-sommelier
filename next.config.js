/** @type {import('next').NextConfig} */
const nextConfig = {
  // Increase the serverless function response size limit for Vercel
  // (App Router handles multipart form data natively — no bodyParser config needed)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

module.exports = nextConfig;
