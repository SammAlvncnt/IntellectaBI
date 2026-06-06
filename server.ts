import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenerativeAI } from "@google/generative-ai"; // Pastikan import ini benar
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  // Konversi string ke number untuk menghindari error 'string is not assignable to number'
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json({ limit: '10mb' }));

  app.post("/api/analyze", async (req, res) => {
    const { summary } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(400).json({ error: "API Key tidak dikonfigurasi." });
    }

    // Inisialisasi library yang benar
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // ... (sisa kode prompt Anda tetap sama) ...
    
    try {
      const result = await model.generateContent({
         contents: [{ role: "user", parts: [{ text: "..." }] }], // Isi prompt di sini
         generationConfig: { responseMimeType: "application/json" }
      });
      
      const response = await result.response;
      const text = response.text();
      res.json(JSON.parse(text));
    } catch (error) {
      res.status(500).json({ error: "Gagal memproses AI" });
    }
  });

  // ... (setup vite tetap sama) ...

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();