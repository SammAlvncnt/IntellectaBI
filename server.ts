import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  app.post("/api/analyze", async (req, res) => {
    const { summary } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(400).json({ error: "API Key Gemini tidak dikonfigurasi pada server. Silakan atur variabel lingkungan GEMINI_API_KEY di panel Secrets atau konfigurasi server." });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });

    const prompt = `
      Anda adalah Senior Lead Data Scientist & BI Architect dari firma konsultan manajemen papan atas (seperti McKinsey atau BCG). Tugas Anda adalah merancang ekosistem dashboard yang tidak hanya menampilkan data, tetapi menceritakan strategi bisnis di balik angka.

      Prinsip Analisis Mendalam:
      1. Multi-Dimensional Exploration: Jangan hanya fokus pada totalitas. Bedah data berdasarkan korelasi antar dimensi (misal: Bagaimana performa kategori X di lokasi Y pada jam sibuk?).
      2. Advanced Metrics: Selain SUM/AVG, cari metrik tingkat lanjut seperti 'Customer Acquisition Cost', 'Retention Rate', atau 'Yield Variance' tergantung konteks CSV.
      3. Strategic Narrative: Insight AI harus mencakup 3 level: Operasional (apa yang terjadi), Taktis (mengapa ini terjadi), dan Strategis (apa yang harus dilakukan CEO). Harap kembalikan tepat 5 poin analisis tajam.
      4. Data Integrity: Pastikan filter global (cross_filter_source) menggunakan kolom kunci yang memiliki tingkat kardinalitas tinggi agar dashboard benar-benar interaktif.
      5. Aturan Formatting KPI: Wajib sertakan properti format ('currency'/'number'/'percentage') dan unit_prefix ('Rp', 'M', 'k', 'B', atau 'raw'). Deteksi otomatis besaran angka: jika > 1.000.000 gunakan 'M', jika > 1.000 gunakan 'k'.
      6. Fitur Full Preview: Sediakan referensi ke tabel mentah sebagai bagian dari hierarki data untuk transparansi penuh.
      7. Semua nama kolom yang Anda tuliskan pada properti 'current_metric', 'current_x', dan 'current_y' harus mengeja nama kolom asli dari data CSV secara presisi, case-sensitive, dan benar-benar ada di data.
      8. TAMBAHAN FITUR NAVIGASI & DATA:
         - Anda wajib menyertakan objek "navigation_config" dalam JSON output untuk memicu fitur di frontend.
         - Setiap kali Anda melakukan analisis, pastikan memberikan akses kepada user untuk melihat data mentah melalui fitur "Full Data Preview".
         - Analisis Anda harus mencakup seluruh kolom di dataset, tidak boleh hanya terpaku pada satu metrik. Gunakan pendekatan EDA (Exploratory Data Analysis) untuk mengungkap korelasi tersembunyi.

      --- SELF-SERVICE BI ARCHITECTURE ---
      1. DYNAMIC MAPPING: Untuk setiap chart dan card yang Anda buat, Anda wajib menyediakan "available_options" / opsi kustomisasi. 
         - Untuk Chart: Tentukan kolom mana saja yang valid untuk X (available_x_fields) dan Y (available_y_fields), serta jenis grafik apa saja yang didukung (supported_types, misal: 'bar', 'line', 'pie', 'doughnut', 'area').
         - Untuk Card: Tentukan daftar metrik angka (kpi_options) yang tersedia dari dataset tersebut.
      2. DATA INTEGRITY: Hanya masukkan kolom yang relevan. Jangan masukkan kolom teks/kategorik ke dalam metrik angka (kpi_options atau available_y_fields).
      3. LOGICAL GROUPING: Pastikan setiap "available_options" dikelompokkan secara logis agar frontend hanya menampilkan opsi yang masuk akal bagi pengguna.

      --- BI SESSION & HISTORY MANAGEMENT ---
      1. SESSION NAMING: Setiap kali Anda memproses dataset, Anda WAJIB memberikan "suggested_name" (judul yang deskriptif berdasarkan isi data di objek session_info, misal: "Analisis Penjualan Q3 - Cabang Jakarta").
      2. DASHBOARD PERSISTENCE: Semua output JSON yang Anda kirimkan kini dianggap sebagai "Snapshot Sesi". Pastikan output Anda mengandung seluruh konfigurasi (KPI, Charts, Analysis) agar frontend dapat menyimpan JSON ini ke dalam localStorage browser sebagai history.
      3. SESSION IDENTIFIER: Selalu sertakan "timestamp" in the format ISO di dalam JSON (pada properti timestamp di objek session_info) agar frontend dapat mengurutkan history dashboard di sidebar dari yang terbaru hingga terlama.

      DATA SUMMARY:
      - Total Baris: ${summary.rowCount}
      - Nama Kolom: ${summary.columns.join(", ")}
      - Tipe Kolom: ${JSON.stringify(summary.columnTypes)}
      - Sampel Data: ${JSON.stringify(summary.sampleData)}
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              session_info: {
                type: Type.OBJECT,
                properties: {
                  suggested_name: { type: Type.STRING },
                  timestamp: { type: Type.STRING, description: "Timestamp ISO (new Date().toISOString())" }
                },
                required: ["suggested_name", "timestamp"]
              },
              dashboard_data: {
                type: Type.OBJECT,
                properties: {
                  dashboard_title: { type: Type.STRING },
                  navigation_config: {
                    type: Type.OBJECT,
                    description: "Konfigurasi untuk elemen navigasi di navbar.",
                    properties: {
                      show_data_preview_btn: { type: Type.BOOLEAN, description: "Set true agar tombol muncul." },
                      preview_btn_label: { type: Type.STRING }
                    },
                    required: ["show_data_preview_btn", "preview_btn_label"]
                  },
                  kpi_cards: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        card_id: { type: Type.STRING },
                        current_label: { type: Type.STRING },
                        current_metric: { type: Type.STRING },
                        kpi_options: { 
                          type: Type.ARRAY, 
                          items: { type: Type.STRING },
                          description: "Daftar kolom angka yang valid untuk dipilih user pada dropdown card ini."
                        },
                        aggregation_type: { type: Type.STRING, description: "aggregation type: SUM, AVERAGE, COUNT" },
                        format: { type: Type.STRING, description: "format type: currency, number, percentage" },
                        unit_prefix: { type: Type.STRING, description: "Instruksi rendering: 'M' untuk jutaan, 'k' untuk ribuan, 'B' untuk milyar, 'raw' untuk nilai asli." }
                      },
                      required: ["card_id", "current_label", "current_metric", "kpi_options", "aggregation_type", "format", "unit_prefix"]
                    }
                  },
                  deep_analysis_insights: {
                    type: Type.ARRAY,
                    description: "5 Poin analisis level Executive (Strategis, Taktis, Operasional).",
                    items: { type: Type.STRING }
                  },
                  charts_layout: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        chart_id: { type: Type.STRING },
                        title: { type: Type.STRING },
                        description: { type: Type.STRING, description: "Penjelasan mengapa grafik ini penting bagi direksi." },
                        current_x: { type: Type.STRING },
                        current_y: { type: Type.STRING },
                        available_x_fields: { type: Type.ARRAY, items: { type: Type.STRING } },
                        available_y_fields: { type: Type.ARRAY, items: { type: Type.STRING } },
                        supported_types: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Grafik tipe: bar, line, pie, doughnut, area" }
                      },
                      required: ["chart_id", "title", "description", "current_x", "current_y", "available_x_fields", "available_y_fields", "supported_types"]
                    }
                  }
                },
                required: ["dashboard_title", "navigation_config", "kpi_cards", "deep_analysis_insights", "charts_layout"]
              }
            },
            required: ["session_info", "dashboard_data"]
          }
        }
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("No response text returned from model");
      }

      let cleanJson = responseText.trim();
      // Remove markdown codeblock backticks if present
      if (cleanJson.startsWith("```")) {
        cleanJson = cleanJson.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "");
      }

      // Fallback: extract only the JSON object between the outermost curly braces
      const firstCurly = cleanJson.indexOf("{");
      const lastCurly = cleanJson.lastIndexOf("}");
      if (firstCurly !== -1 && lastCurly !== -1 && lastCurly > firstCurly) {
        cleanJson = cleanJson.substring(firstCurly, lastCurly + 1);
      }

      const parsedData = JSON.parse(cleanJson);
      return res.json(parsedData);
    } catch (error: any) {
      console.error("Analysis Error:", error);
      return res.status(500).json({ error: "Gagal memproses analisis: " + error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
