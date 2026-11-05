// Vercel Function: pembungkus tipis untuk lib/scan-core.js, tersedia di /api/scan-struk.
// API key dibaca dari Environment Variables proyek Vercel (GROQ_API_KEY / GEMINI_API_KEY).
import { handleScan } from "../lib/scan-core.js";

const run = (req) => handleScan(req, (k) => process.env[k]);
export const POST = run;
export const GET = run; // dijawab 405 oleh handleScan
