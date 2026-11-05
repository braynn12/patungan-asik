// Netlify Edge Function: pembungkus tipis untuk lib/scan-core.js.
// API key dibaca dari environment variable Netlify (GROQ_API_KEY / GEMINI_API_KEY).
import { handleScan } from "../../lib/scan-core.js";

export default (req) => handleScan(req, (k) => Netlify.env.get(k));

export const config = { path: "/api/scan-struk" };
