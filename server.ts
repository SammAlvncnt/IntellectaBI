import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  // Memaksa PORT menjadi angka (Integer) untuk menghindari error tipe data
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json({ limit: '10mb' }));

  app.post("/api/analyze", async (req, res) => {
    const { summary } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "API Key tidak ditemukan di server." });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Prompt ini instruksikan AI agar hanya memberi JSON
    const prompt = `Analisis data ini dan berikan output JSON MURNI saja. TIDAK BOLEH ada teks pembuka atau penutup. 
    Struktur JSON wajib memiliki: session_info, dashboard_data (dashboard_title, navigation_config, kpi_cards, deep_analysis_insights, charts_layout).
    DATA: ${JSON.stringify(summary)}`;

    try {
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      });

      const response = await result.response;
      const rawText = response.text();

      // JARING PENGAMAN: Mengambil teks hanya di antara kurung kurawal '{' dan '}'
      // Ini akan membuang teks seperti "The page content..." yang menyebabkan error
      const jsonStart = rawText.indexOf('{');
      const jsonEnd = rawText.lastIndexOf('}');
      
      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error("AI tidak mengembalikan format JSON yang benar.");
      }

      const cleanJson = rawText.substring(jsonStart, jsonEnd + 1);
      const parsedData = JSON.parse(cleanJson);
      
      return res.json(parsedData);

    } catch (error: any) {
      console.error("DEBUG ERROR:", error);
      return res.status(500).json({ error: "Gagal memproses data: " + error.message });
    }
  });

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