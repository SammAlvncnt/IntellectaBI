import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenerativeAI } from "@google/generative-ai"; // Gunakan nama library yang standar
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  // Pastikan PORT adalah angka, bukan string
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json({ limit: '10mb' }));

  app.post("/api/analyze", async (req, res) => {
    const { summary } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(400).json({ error: "API Key tidak ditemukan" });
    }

    // Inisialisasi yang benar
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      Anda adalah AI Data Processor. Output HANYA boleh berupa JSON murni.
      TIDAK BOLEH ada teks pembuka, penjelasan, atau penutup.
      Jika Anda memberikan teks selain JSON, sistem akan crash.
      
      Struktur JSON wajib:
      {
        "session_info": {"suggested_name": "String", "timestamp": "ISO Date"},
        "dashboard_data": {
          "dashboard_title": "String",
          "navigation_config": {"show_data_preview_btn": true, "preview_btn_label": "String"},
          "kpi_cards": [],
          "deep_analysis_insights": [],
          "charts_layout": []
        }
      }

      DATA CSV: ${JSON.stringify(summary)}
    `;

    try {
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      });

      const response = await result.response;
      const rawResponse = response.text();
      
      // JARING PENGAMAN: Membersihkan teks agar hanya menyisakan JSON murni
      const jsonStart = rawResponse.indexOf('{');
      const jsonEnd = rawResponse.lastIndexOf('}');
      const cleanJson = rawResponse.substring(jsonStart, jsonEnd + 1);

      const parsedData = JSON.parse(cleanJson);
      return res.json(parsedData);

    } catch (error: any) {
      console.error("DEBUG ERROR:", error);
      return res.status(500).json({ error: "Gagal memproses AI: " + error.message });
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