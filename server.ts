import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  // Memastikan port adalah angka (integer)
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json({ limit: '10mb' }));

  app.post("/api/analyze", async (req, res) => {
    const { summary } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "API Key tidak terdeteksi di server." });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Prompt memaksa output JSON murni
    const prompt = `Berikan response JSON MURNI untuk data berikut. 
    TIDAK BOLEH ada teks lain selain JSON.
    Struktur: { "session_info": {}, "dashboard_data": {} }
    DATA: ${JSON.stringify(summary)}`;

    try {
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      });

      const response = await result.response;
      const rawText = response.text();

      // Jaring pengaman: Hanya ambil karakter di antara { dan }
      const jsonStart = rawText.indexOf('{');
      const jsonEnd = rawText.lastIndexOf('}');
      
      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error("AI tidak memberikan JSON yang valid.");
      }

      const cleanJson = rawText.substring(jsonStart, jsonEnd + 1);
      const parsedData = JSON.parse(cleanJson);
      
      return res.json(parsedData);

    } catch (error: any) {
      console.error("DEBUG ERROR:", error);
      return res.status(500).json({ error: "Gagal memproses data AI: " + error.message });
    }
  });

  // Setup Vite
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => res.sendFile(path.join(process.cwd(), 'dist/index.html')));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server berjalan di port ${PORT}`);
  });
}

startServer();