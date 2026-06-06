import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API Route for Gemini Analysis
  app.post("/api/analyze", async (req, res) => {
    const { summary, userApiKey } = req.body;
    const apiKey = userApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(400).json({ error: "Gemini API Key is required." });
    }

    const ai = new GoogleGenAI({ 
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    const prompt = `
      Anda adalah Senior Lead Data Scientist & BI Architect dari firma konsultan manajemen papan atas (seperti McKinsey atau BCG). Tugas Anda adalah merancang ekosistem dashboard yang tidak hanya menampilkan data, tetapi menceritakan strategi bisnis di balik angka.

      Prinsip Analisis Mendalam:
      1. Multi-Dimensional Exploration: Jangan hanya fokus pada totalitas. Bedah data berdasarkan korelasi antar dimensi (misal: Bagaimana performa kategori X di lokasi Y pada jam sibuk?).
      2. Advanced Metrics: Selain SUM/AVG, cari metrik tingkat lanjut seperti 'Customer Acquisition Cost', 'Retention Rate', atau 'Yield Variance' tergantung konteks CSV.
      3. Strategic Narrative: Insight AI harus mencakup 3 level: Operasional (apa yang terjadi), Taktis (mengapa ini terjadi), dan Strategis (apa yang harus dilakukan CEO). Harap kembalikan tepat 5 poin analisis tajam.
      4. Data Integrity: Pastikan filter global (cross_filter_source) menggunakan kolom kunci yang memiliki tingkat kardinalitas tinggi agar dashboard benar-benar interaktif.
      5. Aturan Formatting KPI: Wajib sertakan properti format ('currency'/'number'/'percentage') dan unit_prefix ('Rp', 'M', 'k', 'B', atau 'raw'). Deteksi otomatis besaran angka: jika > 1.000.000 gunakan 'M', jika > 1.000 gunakan 'k'.
      6. Fitur Full Preview: Sertakan referensi ke tabel mentah sebagai bagian dari hierarki data untuk transparansi penuh.
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
      3. SESSION IDENTIFIER: Selalu sertakan "timestamp" dalam format ISO di dalam JSON (pada properti timestamp di objek session_info) agar frontend dapat mengurutkan history dashboard di sidebar dari yang terbaru hingga terlama.

      DATA SUMMARY:
      - Total Baris: ${summary.rowCount}
      - Nama Kolom: ${summary.columns.join(", ")}
      - Tipe Kolom: ${JSON.stringify(summary.columnTypes)}
      - Sampel Data: ${JSON.stringify(summary.sampleData)}
    `;

    const maxRetries = 5;
    let attempt = 0;
    let modelToUse = "gemini-3.5-flash";

    const executeAnalysis = async () => {
      while (attempt <= maxRetries) {
        try {
          const response = await ai.models.generateContent({
            model: modelToUse, 
            contents: [{ parts: [{ text: prompt }] }],
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
                            aggregation_type: { type: Type.STRING, enum: ["SUM", "AVERAGE", "COUNT"] },
                            format: { type: Type.STRING, enum: ["currency", "number", "percentage"] },
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
                            supported_types: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Grafik tipe: 'bar', 'line', 'pie', 'doughnut', 'area'" }
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

          const result = JSON.parse(response.text || "{}");
          return res.json(result);
        } catch (error: any) {
          const errorMessage = error.message || "";
          const isQuotaError = errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED");
          const isNotFoundError = errorMessage.includes("404") || errorMessage.includes("NOT_FOUND");
          const isPermissionError = errorMessage.includes("403") || errorMessage.includes("PERMISSION_DENIED");
          
          if (isQuotaError && attempt < maxRetries) {
            attempt++;
            
            // Try different model if one is failing quota
            if (attempt === 1 && modelToUse === "gemini-3.5-flash") {
              modelToUse = "gemini-3.1-flash-lite";
              console.warn("Switching to gemini-3.1-flash-lite due to quota limits on 3.5-flash");
            }

            // Longer delay for quota issues as per error logs (often 30s+)
            const delay = Math.pow(2, attempt) * 5000 + 5000; 
            console.warn(`Quota exceeded for ${modelToUse}. Retrying in ${Math.round(delay)}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          if (isNotFoundError && attempt < maxRetries) {
             if (modelToUse === "gemini-3.5-flash") {
               modelToUse = "gemini-3.1-flash-lite";
             } else {
               modelToUse = "gemini-flash-latest"; // Fallback to compatible alias
             }
             attempt++;
             continue; 
          }

          console.error("Analysis Error Details:", {
            attempt,
            model: modelToUse,
            error: errorMessage
          });

          let userFriendlyError = errorMessage || "Gagal menganalisis data.";
          if (isQuotaError) {
            userFriendlyError = "API Quota exceeded. Pastikan API Key Anda memiliki kuota yang tersedia di Google AI Studio (Bukan limit 0). Coba lagi dalam beberapa menit.";
          } else if (isNotFoundError) {
            userFriendlyError = `Model ${modelToUse} tidak ditemukan. Silakan periksa konfigurasi API Anda.`;
          } else if (isPermissionError) {
            userFriendlyError = "Izin ditolak (403). Pastikan API Key Anda valid dan memiliki akses ke model Generative AI.";
          }
          
          return res.status(500).json({ error: userFriendlyError });
        }
      }
    };

    await executeAnalysis();
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
