import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  // Gunakan angka untuk port, bukan string
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json({ limit: '10mb' }));

  app.post("/api/analyze", async (req, res) => {
    const { summary } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "API Key tidak ada" });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Analisis data ini dan berikan output JSON murni tanpa kata pengantar apapun.
      DATA: ${JSON.stringify(summary)}
      Format JSON wajib memiliki: session_info (suggested_name, timestamp), dan dashboard_data (dashboard_title, navigation_config, kpi_cards, deep_analysis_insights, charts_layout).`;

    try {
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      });

      const response = await result.response;
      const rawResponse = response.text();
      
      // JARING PENGAMAN: Memastikan hanya mengambil JSON
      const jsonStart = rawResponse.indexOf('{');
      const jsonEnd = rawResponse.lastIndexOf('}');
      const cleanJson = rawResponse.substring(jsonStart, jsonEnd + 1);

      const parsedData = JSON.parse(cleanJson);
      return res.json(parsedData);

    } catch (error: any) {
      console.error("DEBUG ERROR:", error);
      return res.status(500).json({ error: "AI Error: " + error.message });
    }
  });

  // Setup Vite/Static
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => res.sendFile(path.join(process.cwd(), 'dist/index.html')));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
}

startServer();