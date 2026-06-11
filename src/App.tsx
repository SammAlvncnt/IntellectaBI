/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import Papa from 'papaparse';
import { 
  FileUp, 
  BarChart3, 
  TrendingUp, 
  BrainCircuit, 
  Coffee, 
  Database, 
  ChevronRight, 
  AlertCircle,
  Table as TableIcon,
  LayoutDashboard,
  Settings,
  X,
  Plus,
  Menu,
  Save,
  LogOut,
  Lock,
  Sparkles,
  ShieldCheck,
  Layers,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signOut,
  onAuthStateChanged, 
  db, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  getDocs, 
  query, 
  where,
  orderBy,
  onSnapshot
} from './firebase';
import type { User } from './firebase';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AnalysisSummary, GeminiResponse, DashboardData, KPI, SelfServiceChartConfig, KpiCardConfig, SavedSession } from './types';

// Register ChartJS
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface SandboxUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
  isSandbox: boolean;
}

export default function App() {
  const [csvData, setCsvData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  
  // Self-Service BI States
  const [kpiOverrides, setKpiOverrides] = useState<Record<string, {
    metric: string;
    aggregation: 'SUM' | 'AVERAGE' | 'COUNT';
    format: 'currency' | 'number' | 'percentage';
    unitPrefix: string;
  }>>({});

  const [chartOverrides, setChartOverrides] = useState<Record<string, {
    x: string;
    y: string;
    type: 'bar' | 'line' | 'pie' | 'doughnut' | 'area';
  }>>({});

  const handleKpiOverrideChange = (cardId: string, key: string, value: any) => {
    setKpiOverrides(prev => {
      const cardPrev = prev[cardId] || {};
      const kpiCards = dashboard?.aiResult?.dashboard_data?.kpi_cards || (dashboard?.aiResult as any)?.kpi_cards;
      const originalCard = kpiCards?.find(c => c.card_id === cardId);
      return {
        ...prev,
        [cardId]: {
          metric: cardPrev.metric || originalCard?.current_metric || '',
          aggregation: cardPrev.aggregation || originalCard?.aggregation_type || 'SUM',
          format: cardPrev.format || originalCard?.format || 'number',
          unitPrefix: cardPrev.unitPrefix || originalCard?.unit_prefix || 'raw',
          [key]: value
        }
      };
    });
  };

  const handleChartOverrideChange = (chartId: string, key: string, value: any) => {
    setChartOverrides(prev => {
      const chartPrev = prev[chartId] || {};
      const chartsLayout = dashboard?.aiResult?.dashboard_data?.charts_layout || (dashboard?.aiResult as any)?.charts_layout;
      const originalChart = chartsLayout?.find(c => c.chart_id === chartId);
      return {
        ...prev,
        [chartId]: {
          x: chartPrev.x || originalChart?.current_x || '',
          y: chartPrev.y || originalChart?.current_y || '',
          type: chartPrev.type || originalChart?.supported_types?.[0] as any || 'bar',
          [key]: value
        }
      };
    });
  };

  // Helper to identify numeric and categoric columns dynamically
  const numericColumns = React.useMemo(() => {
    if (!csvData.length) return [];
    return headers.filter(col => {
      const samples = csvData.slice(0, 15).map(r => r[col]).filter(v => v !== undefined && v !== null && v !== "");
      if (!samples.length) return false;
      return samples.every(v => typeof v === 'number' || (!isNaN(v as any) && !isNaN(parseFloat(v as any))));
    });
  }, [csvData, headers]);

  const categoricColumns = React.useMemo(() => {
    if (!csvData.length) return [];
    return headers.filter(col => !numericColumns.includes(col));
  }, [csvData, headers, numericColumns]);

  // Clean option lists for UI select filters
  const getKpiOptions = useCallback((specOptions: string[], activeMetric: string) => {
    const base = numericColumns.length > 0 ? numericColumns : headers;
    return Array.from(new Set([...base, activeMetric])).filter((item): item is string => !!item);
  }, [numericColumns, headers]);

  const getXOptions = useCallback((activeX: string, chartType: string) => {
    const base = categoricColumns.length > 0 ? categoricColumns : headers;
    let filtered = base;
    if (['pie', 'doughnut'].includes(chartType)) {
      const pieBase = headers.filter(col => {
        const uniqueVals = new Set(csvData.map(r => r[col]).filter(v => v !== undefined && v !== null && v !== ""));
        return uniqueVals.size > 0 && uniqueVals.size <= 25;
      });
      if (pieBase.length > 0) filtered = pieBase;
    }
    return Array.from(new Set([...filtered, activeX])).filter((item): item is string => !!item);
  }, [categoricColumns, headers, csvData]);

  const getYOptions = useCallback((activeY: string) => {
    const base = numericColumns.length > 0 ? numericColumns : headers;
    return Array.from(new Set([...base, activeY])).filter((item): item is string => !!item);
  }, [numericColumns, headers]);

  // Auto-collapse sidebar on smaller screens on load
  useEffect(() => {
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  }, []);
  
  // Firebase Authentication & Session Synchronization States
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [firstTimeLoaded, setFirstTimeLoaded] = useState(false);
  const [authTab, setAuthTab] = useState<'sandbox' | 'google'>('sandbox');
  const [sandboxEmail, setSandboxEmail] = useState('samuelalvincent2005@gmail.com');
  const [sandboxName, setSandboxName] = useState('Samuel Alvincent');

  // Business History States
  const [historyList, setHistoryList] = useState<SavedSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [sessionSaveNameInput, setSessionSaveNameInput] = useState('');

  // Authentication state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        setAuthTab('google');
      } else {
        setCurrentUser((prev: any) => {
          if (prev && prev.isSandbox) {
            return prev;
          }
          return null;
        });
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Sync session list from Firestore or Sandboxed LocalStorage reactively
  useEffect(() => {
    if (!currentUser) {
      setHistoryList([]);
      setFirstTimeLoaded(false);
      return;
    }

    if (currentUser.isSandbox) {
      const key = `intellecta_history_sandbox_${currentUser.uid}`;
      try {
        const raw = localStorage.getItem(key);
        setHistoryList(raw ? JSON.parse(raw) : []);
      } catch {
        setHistoryList([]);
      }
      return;
    }

    const q = query(
      collection(db, 'sessions'), 
      where('userId', '==', currentUser.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: SavedSession[] = [];
      snapshot.forEach((doc) => {
        const d = doc.data() as SavedSession;
        if (d.userId === currentUser.uid) {
          items.push(d);
        }
      });
      // Sort items by timestamp descending
      items.sort((a, b) => {
        const timeA = new Date(a.session_info?.timestamp || 0).getTime();
        const timeB = new Date(b.session_info?.timestamp || 0).getTime();
        return timeB - timeA;
      });
      setHistoryList(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sessions');
    });
    return () => unsubscribe();
  }, [currentUser]);

  // Handle load of latest snapshot on login
  useEffect(() => {
    if (historyList.length > 0 && !firstTimeLoaded) {
      handleSelectSession(historyList[0]);
      setFirstTimeLoaded(true);
    }
  }, [historyList, firstTimeLoaded]);

  const handleLogin = async () => {
    try {
      setError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Gagal masuk menggunakan Google.");
    }
  };

  const handleSandboxLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = sandboxEmail.trim().toLowerCase();
    const cleanName = sandboxName.trim() || 'Masyarakat Enterprise';
    if (!cleanEmail) {
      setError('Harap masukkan alamat email professional Anda.');
      return;
    }
    setError(null);
    const mockUser: SandboxUser = {
      uid: `sandbox_${btoa(cleanEmail).replace(/=/g, '')}`,
      email: cleanEmail,
      displayName: cleanName,
      photoURL: null,
      isSandbox: true
    };
    setCurrentUser(mockUser);
    setFirstTimeLoaded(false);
  };

  const handleLogout = async () => {
    try {
      setError(null);
      if (currentUser && currentUser.isSandbox) {
        setCurrentUser(null);
        resetState();
        return;
      }
      await signOut(auth);
      resetState();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Gagal keluar sesi.");
    }
  };

  const resetState = useCallback(() => {
    setCsvData([]);
    setHeaders([]);
    setFileName(null);
    setDashboard(null);
    setKpiOverrides({});
    setChartOverrides({});
    setActiveFilters({});
    setActiveSessionId(null);
  }, []);

  const triggerSaveSessionDialog = useCallback(() => {
    if (!dashboard) return;
    const suggestedName = dashboard.aiResult?.session_info?.suggested_name || 
                          dashboard.aiResult?.dashboard_data?.dashboard_title || 
                          "Dashboard Baru";
    setSessionSaveNameInput(suggestedName);
    setIsSaveModalOpen(true);
  }, [dashboard]);

  const handleSaveCurrentSessionSubmit = useCallback(async () => {
    if (!dashboard || !currentUser) return;
    const nameToSave = sessionSaveNameInput.trim() || 
                       dashboard.aiResult?.session_info?.suggested_name || 
                       dashboard.aiResult?.dashboard_data?.dashboard_title || 
                       "Dashboard Analisis";
    
    const sessId = activeSessionId || (currentUser.isSandbox ? `sess_${Date.now()}` : doc(collection(db, 'sessions')).id);
    const timestampISO = dashboard.aiResult?.session_info?.timestamp || new Date().toISOString();

    const newSession: SavedSession = {
      id: sessId,
      userId: currentUser.uid,
      session_info: {
        suggested_name: nameToSave,
        timestamp: timestampISO
      },
      fileName,
      csvData,
      headers,
      aiResult: dashboard.aiResult,
      kpiOverrides,
      chartOverrides,
      activeFilters
    };

    if (currentUser.isSandbox) {
      const key = `intellecta_history_sandbox_${currentUser.uid}`;
      try {
        const raw = localStorage.getItem(key);
        const existing: SavedSession[] = raw ? JSON.parse(raw) : [];
        const filtered = existing.filter(s => s.id !== sessId);
        const updated = [newSession, ...filtered];
        localStorage.setItem(key, JSON.stringify(updated));
        setHistoryList(updated);
        setActiveSessionId(sessId);
        setIsSaveModalOpen(false);
      } catch (err) {
        console.error('LocalStorage write error', err);
        setError('Gagal menyimpan ke penyimpanan lokal sandbox.');
      }
      return;
    }

    try {
      await setDoc(doc(db, 'sessions', sessId), newSession);
      setActiveSessionId(sessId);
      setIsSaveModalOpen(false);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `sessions/${sessId}`);
    }
  }, [dashboard, activeSessionId, fileName, csvData, headers, kpiOverrides, chartOverrides, activeFilters, sessionSaveNameInput, currentUser]);

  const handleSelectSession = useCallback((session: SavedSession) => {
    setActiveSessionId(session.id);
    setCsvData(session.csvData || []);
    setHeaders(session.headers || []);
    setFileName(session.fileName || null);
    setDashboard({
      summary: {
        rowCount: session.csvData ? session.csvData.length : 0,
        columns: session.headers || [],
        columnTypes: {},
        sampleData: session.csvData ? session.csvData.slice(0, 100) : []
      },
      aiResult: session.aiResult,
      allocatedKpis: [],
      aggregatedCharts: []
    });
    setKpiOverrides(session.kpiOverrides || {});
    setChartOverrides(session.chartOverrides || {});
    setActiveFilters(session.activeFilters || {});
  }, []);

  const handleDeleteSession = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) return;
    if (confirm("Hapus sesi analisis ini dari database?")) {
      if (currentUser.isSandbox) {
        const key = `intellecta_history_sandbox_${currentUser.uid}`;
        try {
          const raw = localStorage.getItem(key);
          const existing: SavedSession[] = raw ? JSON.parse(raw) : [];
          const updated = existing.filter(s => s.id !== id);
          localStorage.setItem(key, JSON.stringify(updated));
          setHistoryList(updated);
          if (activeSessionId === id) {
            setActiveSessionId(null);
            setCsvData([]);
            setHeaders([]);
            setFileName(null);
            setDashboard(null);
            setKpiOverrides({});
            setChartOverrides({});
            setActiveFilters({});
          }
        } catch (err) {
          console.error('LocalStorage delete error', err);
        }
        return;
      }

      try {
        await deleteDoc(doc(db, 'sessions', id));
        if (activeSessionId === id) {
          setActiveSessionId(null);
          setCsvData([]);
          setHeaders([]);
          setFileName(null);
          setDashboard(null);
          setKpiOverrides({});
          setChartOverrides({});
          setActiveFilters({});
        }
      } catch (err: any) {
        handleFirestoreError(err, OperationType.DELETE, `sessions/${id}`);
      }
    }
  }, [activeSessionId, currentUser, historyList]);

  // Sync state changes instantly back to Firestore or Local Storage Sandbox
  useEffect(() => {
    if (currentUser && activeSessionId && historyList.length > 0) {
      const activeSessionObj = historyList.find(s => s.id === activeSessionId);
      if (activeSessionObj) {
        const hasKpiChanges = JSON.stringify(activeSessionObj.kpiOverrides) !== JSON.stringify(kpiOverrides);
        const hasChartChanges = JSON.stringify(activeSessionObj.chartOverrides) !== JSON.stringify(chartOverrides);
        const hasFilterChanges = JSON.stringify(activeSessionObj.activeFilters) !== JSON.stringify(activeFilters);
        if (hasKpiChanges || hasChartChanges || hasFilterChanges) {
          if (currentUser.isSandbox) {
            const key = `intellecta_history_sandbox_${currentUser.uid}`;
            const updated = historyList.map(s => {
              if (s.id === activeSessionId) {
                return {
                  ...s,
                  kpiOverrides,
                  chartOverrides,
                  activeFilters
                };
              }
              return s;
            });
            localStorage.setItem(key, JSON.stringify(updated));
            setHistoryList(updated);
            return;
          }

          const sessionRef = doc(db, 'sessions', activeSessionId);
          setDoc(sessionRef, {
            kpiOverrides,
            chartOverrides,
            activeFilters
          }, { merge: true }).catch(err => {
            handleFirestoreError(err, OperationType.WRITE, `sessions/${activeSessionId}`);
          });
        }
      }
    }
  }, [kpiOverrides, chartOverrides, activeFilters, activeSessionId, currentUser, historyList]);

  // Data Preview Modal State
  const [isDataPreviewOpen, setIsDataPreviewOpen] = useState(false);
  const [previewSearchQuery, setPreviewSearchQuery] = useState('');
  const [previewCurrentPage, setPreviewCurrentPage] = useState(1);
  const [previewSortColumn, setPreviewSortColumn] = useState<string | null>(null);
  const [previewSortDirection, setPreviewSortDirection] = useState<'asc' | 'desc'>('asc');



  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    event.preventDefault();
    setError(null);
    setActiveFilters({});
    setDashboard(null);
    setKpiOverrides({});
    setChartOverrides({});
    
    let file: File | undefined;
    if ('dataTransfer' in event) {
      file = event.dataTransfer.files[0];
    } else {
      file = event.target.files?.[0];
    }

    if (!file || !file.name.endsWith('.csv')) {
      setError("Please upload a valid CSV file.");
      return;
    }

    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        setCsvData(results.data);
        setHeaders(Object.keys(results.data[0] || {}));
      },
      error: (err) => {
        setError("Error parsing CSV: " + err.message);
      }
    });
  };

  const aggregateData = (data: any[], config: { x_axis_column: string; y_axis_column: string; cross_filter_source?: string }, currentFilters: Record<string, string>) => {
    // filter data by other columns' active filters except this chart's cross_filter_source
    let filtered = data;
    Object.entries(currentFilters).forEach(([col, val]) => {
      if (col !== config.cross_filter_source) {
        filtered = filtered.filter(row => String(row[col] ?? '') === val);
      }
    });

    const groups: Record<string, number[]> = {};
    
    filtered.forEach(row => {
      const xVal = String(row[config.x_axis_column] ?? 'Unknown');
      const yVal = Number(row[config.y_axis_column]);
      
      if (!groups[xVal]) groups[xVal] = [];
      if (!isNaN(yVal)) groups[xVal].push(yVal);
    });

    let labels = Object.keys(groups);

    // Kronologis alami jika bulan atau urutan waktu terdeteksi
    const monthMap: Record<string, number> = {
      'jan': 1, 'januari': 1, 'january': 1,
      'feb': 2, 'februari': 2, 'february': 2,
      'mar': 3, 'maret': 3, 'march': 3,
      'apr': 4, 'april': 4,
      'mei': 5, 'may': 5,
      'jun': 6, 'juni': 6, 'june': 6,
      'jul': 7, 'juli': 7, 'july': 7,
      'agu': 8, 'agustus': 8, 'august': 8,
      'sep': 9, 'september': 9,
      'okt': 10, 'oktober': 10, 'october': 10,
      'nov': 11, 'november': 11,
      'des': 12, 'desember': 12, 'december': 12
    };

    const isTimeX = labels.some(l => monthMap[l.trim().toLowerCase().slice(0, 3)] !== undefined);

    if (isTimeX) {
      labels.sort((a, b) => {
        const valA = monthMap[a.trim().toLowerCase().slice(0, 3)] || monthMap[a.trim().toLowerCase()] || 999;
        const valB = monthMap[b.trim().toLowerCase().slice(0, 3)] || monthMap[b.trim().toLowerCase()] || 999;
        return valA - valB;
      });
    } else {
      labels.sort((a, b) => {
        const numA = Number(a);
        const numB = Number(b);
        if (!isNaN(numA) && !isNaN(numB)) {
          return numA - numB;
        }
        return a.localeCompare(b);
      });
    }

    const values = labels.map(label => {
      const vals = groups[label];
      // Default to sum for business dashboard charts
      return vals.reduce((a, b) => a + b, 0);
    });

    return { labels, values };
  };

  const handleAnalyze = async () => {
    if (csvData.length === 0) {
      setError("Sediakan data CSV terlebih dahulu.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const columns = headers;
      const columnTypes: Record<string, 'numeric' | 'categoric'> = {};
      columns.forEach(col => {
        const sample = csvData.slice(0, 5).map(r => r[col]);
        columnTypes[col] = sample.some(v => typeof v === 'number') ? 'numeric' : 'categoric';
      });

      const summary: AnalysisSummary = {
        rowCount: csvData.length,
        columns,
        columnTypes,
        sampleData: csvData.slice(0, 100)
      };

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary })
      });

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = "Gagal menganalisis data.";
        try {
          const errData = JSON.parse(errText);
          errMsg = errData.error || errMsg;
        } catch (e) {
          errMsg = errText || errMsg;
        }
        throw new Error(errMsg);
      }

      const resText = await response.text();
      let aiResult: GeminiResponse;
      try {
        aiResult = JSON.parse(resText);
      } catch (parseErr: any) {
        throw new Error(`Respons dari server tidak valid (bukan JSON): ${resText.slice(0, 100)}...`);
      }

      setActiveSessionId(null);
      setDashboard({
        summary,
        aiResult,
        allocatedKpis: [],
        aggregatedCharts: []
      });
      setKpiOverrides({});
      setChartOverrides({});
      setActiveFilters({});

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Dynamic KPIs calculated reactively
  const allocatedKpis = React.useMemo(() => {
    if (!dashboard || !dashboard.aiResult) return [];
    const kpiCards = dashboard.aiResult.dashboard_data?.kpi_cards || (dashboard.aiResult as any).kpi_cards;
    if (!kpiCards) return [];
    
    return kpiCards.map(kpiSpec => {
      const override = kpiOverrides[kpiSpec.card_id];
      const activeMetric = override?.metric || kpiSpec.current_metric;
      const activeAggregation = override?.aggregation || kpiSpec.aggregation_type || 'SUM';
      const activeFormat = override?.format || kpiSpec.format || 'number';
      const activeUnitPrefix = override?.unitPrefix || kpiSpec.unit_prefix || 'raw';

      // Filter data by ALL active filters
      let filtered = csvData;
      Object.entries(activeFilters).forEach(([col, val]) => {
        filtered = filtered.filter(row => String(row[col] ?? '') === val);
      });

      const values = filtered.map(row => Number(row[activeMetric])).filter(v => !isNaN(v));

      let calculatedValue = 0;
      const aggUpper = activeAggregation.toUpperCase();
      if (aggUpper === 'SUM') {
        calculatedValue = values.reduce((a, b) => a + b, 0);
      } else if (aggUpper === 'AVERAGE' || aggUpper === 'AVG') {
        calculatedValue = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      } else if (aggUpper === 'COUNT') {
        calculatedValue = filtered.length;
      } else {
        calculatedValue = values.length ? values.reduce((a, b) => a + b, 0) : 0;
      }

      let scaledValue = calculatedValue;
      let suffix = "";
      
      if (activeUnitPrefix === 'M') {
        scaledValue = calculatedValue / 1000000;
        suffix = " M";
      } else if (activeUnitPrefix === 'k') {
        scaledValue = calculatedValue / 1000;
        suffix = " k";
      } else if (activeUnitPrefix === 'B') {
        scaledValue = calculatedValue / 1000000000;
        suffix = " B";
      }

      const precision = (activeUnitPrefix === 'M' || activeUnitPrefix === 'B') ? 2 : (activeUnitPrefix === 'k' ? 1 : 0);
      let formattedVal = scaledValue.toLocaleString('id-ID', {
        minimumFractionDigits: scaledValue % 1 === 0 ? 0 : precision,
        maximumFractionDigits: precision
      });

      let prefix = "";
      if (activeFormat === 'currency') {
        prefix = "Rp ";
      }

      let formatted = prefix + formattedVal + suffix;
      if (activeFormat === 'percentage') {
        formatted = formatted + "%";
      }

      // Human-friendly label based on selection
      let labelText = kpiSpec.current_label;
      if (override?.metric) {
        const formatMetricName = activeMetric.replace(/_/g, ' ');
        labelText = `${activeAggregation} ${formatMetricName}`;
      }

      return {
        card_id: kpiSpec.card_id,
        options: kpiSpec.kpi_options,
        current_metric: activeMetric,
        current_aggregation: activeAggregation,
        current_format: activeFormat,
        current_unit_prefix: activeUnitPrefix,
        label: labelText,
        value: formatted
      };
    });
  }, [dashboard, csvData, activeFilters, kpiOverrides]);

  // Dynamic Charts calculated reactively
  const aggregatedCharts = React.useMemo(() => {
    if (!dashboard || !dashboard.aiResult) return [];
    const chartsLayout = dashboard.aiResult.dashboard_data?.charts_layout || (dashboard.aiResult as any).charts_layout;
    if (!chartsLayout) return [];
    
    return chartsLayout.map(chartConfig => {
      const override = chartOverrides[chartConfig.chart_id];
      const activeX = override?.x || chartConfig.current_x;
      const activeY = override?.y || chartConfig.current_y;
      const activeType = override?.type || chartConfig.supported_types?.[0] as any || 'bar';

      // Build config for aggregateData
      const computedConfig = {
        x_axis_column: activeX,
        y_axis_column: activeY,
        cross_filter_source: activeX,
      };

      const { labels, values } = aggregateData(csvData, computedConfig, activeFilters);
      
      const isPieOrDoughnut = ['pie', 'doughnut'].includes(activeType);
      const isArea = activeType === 'area';
      
      // Theme beautiful colors
      let bgColors: string | string[];
      let borderCol = '#865439';

      if (isPieOrDoughnut) {
        bgColors = [
          '#865439', // Goldish chocolate
          '#a47e62', // Soft brown
          '#dfd3c3', // Warm cream
          '#c5a880', // Ochre
          '#5c3d2e', // Espresso
          '#3e2c23', // Dark cocoa
          '#f5ebe0'  // Light tan
        ];
        borderCol = '#ffffff';
      } else if (isArea) {
        bgColors = 'rgba(134, 84, 57, 0.15)'; // Fill for Line Area
        borderCol = '#865439';
      } else {
        bgColors = 'rgba(164, 126, 98, 0.7)';
        borderCol = '#a47e62';
      }

      return {
        config: {
          ...chartConfig,
          chart_type: activeType,
          x_axis_column: activeX,
          y_axis_column: activeY,
          cross_filter_source: activeX
        },
        activeX,
        activeY,
        activeType,
        originalConfig: chartConfig,
        data: {
          labels,
          datasets: [{
            label: `${activeY} (grouped by ${activeX})`,
            data: values,
            backgroundColor: bgColors,
            borderColor: borderCol,
            borderWidth: 1.5,
            fill: isArea,
            tension: 0.35,
          }]
        }
      };
    });
  }, [dashboard, csvData, activeFilters, chartOverrides]);

  // Dynamic preview data filtered reactively
  const filteredTableData = React.useMemo(() => {
    let filtered = csvData;
    Object.entries(activeFilters).forEach(([col, val]) => {
      filtered = filtered.filter(row => String(row[col] ?? '') === val);
    });
    return filtered;
  }, [csvData, activeFilters]);

  // Computed entire table data for Modal
  const modalFilteredData = React.useMemo(() => {
    let result = [...csvData];
    
    // 1. Search Query filter (universal text search across all columns)
    if (previewSearchQuery) {
      const query = previewSearchQuery.toLowerCase().trim();
      result = result.filter(row => {
        return headers.some(header => {
          const val = row[header];
          return val !== undefined && val !== null && String(val).toLowerCase().includes(query);
        });
      });
    }

    // 2. Sorting
    if (previewSortColumn) {
      result.sort((a, b) => {
        const valA = a[previewSortColumn];
        const valB = b[previewSortColumn];

        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;

        const numA = Number(valA);
        const numB = Number(valB);

        let compareResult = 0;
        if (!isNaN(numA) && !isNaN(numB)) {
          compareResult = numA - numB;
        } else {
          compareResult = String(valA).localeCompare(String(valB));
        }

        return previewSortDirection === 'asc' ? compareResult : -compareResult;
      });
    }

    return result;
  }, [csvData, headers, previewSearchQuery, previewSortColumn, previewSortDirection]);

  // Reset page to 1 when query changes
  useEffect(() => {
    setPreviewCurrentPage(1);
  }, [previewSearchQuery]);

  const modalPageSize = 15;
  const totalModalPages = Math.max(1, Math.ceil(modalFilteredData.length / modalPageSize));
  
  const paginatedModalData = React.useMemo(() => {
    const startIndex = (previewCurrentPage - 1) * modalPageSize;
    return modalFilteredData.slice(startIndex, startIndex + modalPageSize);
  }, [modalFilteredData, previewCurrentPage]);

  const handleExportCSV = () => {
    if (modalFilteredData.length === 0) return;
    const csvContent = [
      headers.join(","),
      ...modalFilteredData.map(row => 
        headers.map(h => {
          let cell = row[h] === null || row[h] === undefined ? "" : String(row[h]);
          if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
            cell = `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        }).join(",")
      )
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `filtered_export_${fileName || 'data'}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const CSVPreviewTable = ({ isDashboard = false }: { isDashboard?: boolean }) => (
    <div className={cn(
      "overflow-hidden flex flex-col",
      isDashboard ? "h-44 dashboard-card" : "mt-8 dashboard-card"
    )}>
      <div className="bg-slate-50 px-4 py-2 border-b border-latte flex justify-between items-center">
        <h3 className="text-[10px] font-bold uppercase text-coffee-dark tracking-wider">CSV Raw Data Preview (Top 20)</h3>
        <span className="text-[9px] opacity-60 italic">
          Showing 1-{Math.min(20, filteredTableData.length)} of {filteredTableData.length} rows 
          {Object.keys(activeFilters).length > 0 && ` (Filtered from ${csvData.length})`}
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[10px] text-left border-collapse">
          <thead className="bg-white sticky top-0 border-b border-latte font-bold">
            <tr>
              {headers.map(h => (
                <th key={h} className="p-2 border-r border-latte/30 last:border-0">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-latte/30">
            {filteredTableData.slice(0, 20).map((row, i) => (
              <tr key={i} className={cn("hover:bg-slate-50 transition-colors", i % 2 === 1 && "bg-slate-50/30")}>
                {headers.map(h => (
                  <td key={h} className="p-2 truncate max-w-[150px] border-r border-latte/30 last:border-0">{String(row[h] ?? '')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const navConfig = dashboard?.aiResult?.dashboard_data?.navigation_config || (dashboard?.aiResult as any)?.navigation_config;

  if (isAuthLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-stone-50 text-coffee-dark font-sans">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-12 h-12 bg-coffee-medium rounded-xl flex items-center justify-center text-white shadow-xl shadow-coffee-medium/20 animate-pulse">
            <BrainCircuit size={28} />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <h2 className="text-lg font-bold tracking-tight uppercase text-coffee-dark">Intellecta<span className="text-coffee-medium">BI</span></h2>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              <span className="text-[10px] font-bold text-coffee-medium tracking-widest uppercase">Connecting to Secure Tenant Cloud...</span>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-stone-50 font-sans text-coffee-dark flex flex-col justify-between overflow-x-hidden relative">
        <header className="px-8 py-4 bg-white border-b border-latte flex items-center justify-between shadow-xs sticky top-0 z-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-coffee-medium rounded-lg flex items-center justify-center text-white">
              <BrainCircuit size={18} />
            </div>
            <span className="text-xl font-bold tracking-tight">Intellecta<span className="text-coffee-medium">BI</span></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] bg-emerald-50 text-emerald-800 border border-emerald-200/50 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
              Server-Side API Authentication
            </span>
            <span className="text-[9px] bg-amber-50 text-amber-800 border border-amber-200/50 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
              Multi-Tenant Security
            </span>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-6 py-12 md:py-16">
          <div className="max-w-6xl w-full grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-14 items-center">
            {/* Left Content column */}
            <div className="md:col-span-7 flex flex-col gap-6 text-left">
              <div className="flex flex-col gap-3">
                <div className="inline-flex items-center gap-1.5 self-start px-2.5 py-1 bg-latte/20 text-coffee-dark text-[10px] font-black uppercase tracking-widest rounded-md border border-latte/40">
                  <Sparkles size={11} className="text-coffee-medium" />
                  <span>Interactive Enterprise Intelligence</span>
                </div>
                <h2 className="text-3xl md:text-5xl font-black tracking-tight text-coffee-dark leading-[1.1]">
                  Analisis CSV Anda <br />Seketika dengan <span className="text-coffee-medium">Gemini AI</span>
                </h2>
                <p className="text-sm md:text-base text-coffee-medium/90 font-medium leading-relaxed max-w-lg mt-2">
                  Unggah file CSV mentah apa saja, dapatkan KPI interaktif kustom, visualisasi otomatis, dan ringkasan strategic insights bertaraf Chief Executive dalam hitungan detik. Tanpa pengaturan kode, tanpa batasan rumit.
                </p>
              </div>

              {/* Core Features list bento-like */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                <div className="bg-white border border-latte/40 p-4 rounded-xl flex items-start gap-3 shadow-xs">
                  <div className="p-1.5 bg-latte/30 rounded-lg text-coffee-medium shrink-0">
                    <Activity size={16} />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-coffee-dark">Dynamic Interactive Dashboard</h4>
                    <p className="text-[10px] text-coffee-medium/90 font-medium leading-normal mt-0.5">Filter seluruh metrik visualisasi secara realtime hanya dengan mengeklik salah satu kategori diagram.</p>
                  </div>
                </div>

                <div className="bg-white border border-latte/40 p-4 rounded-xl flex items-start gap-3 shadow-xs">
                  <div className="p-1.5 bg-latte/30 rounded-lg text-coffee-medium shrink-0">
                    <Settings size={16} />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-coffee-dark">Self-Service BI Modification</h4>
                    <p className="text-[10px] text-coffee-medium/90 font-medium leading-normal mt-0.5">Edit dan ubah rumus aggregasi KPI, label metrik, dan tipe visualisasi bagan secara langsung tanpa memproses ulang data.</p>
                  </div>
                </div>

                <div className="bg-white border border-latte/40 p-4 rounded-xl flex items-start gap-3 shadow-xs">
                  <div className="p-1.5 bg-latte/30 rounded-lg text-coffee-medium shrink-0">
                    <Database size={16} />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-coffee-dark">Cloud Persistence Saved Sessions</h4>
                    <p className="text-[10px] text-coffee-medium/90 font-medium leading-normal mt-0.5">Sesi Anda disimpan secara aman di cloud Firestore per user sehingga Anda tidak akan pernah kehilangan riwayat analisis.</p>
                  </div>
                </div>

                <div className="bg-white border border-latte/40 p-4 rounded-xl flex items-start gap-3 shadow-xs">
                  <div className="p-1.5 bg-latte/30 rounded-lg text-coffee-medium shrink-0">
                    <ShieldCheck size={16} />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-coffee-dark">Secure Multi-Tenant Sandbox</h4>
                    <p className="text-[10px] text-coffee-medium/90 font-medium leading-normal mt-0.5">Arsitektur multi-tenant modern mengisolasi data Anda dengan tertib. Tidak ada kebocoran snapshot lintas pengguna.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Login column */}
            <div className="md:col-span-5">
              <div className="bg-white border-2 border-coffee-medium/20 rounded-2xl p-6 md:p-8 flex flex-col gap-5 shadow-xl sticky-top animate-fade-in">
                <div className="flex flex-col gap-1 text-center">
                  <div className="w-10 h-10 bg-coffee-medium/10 rounded-full flex items-center justify-center text-coffee-medium mx-auto mb-1">
                    <Lock size={18} />
                  </div>
                  <h3 className="text-lg font-extrabold tracking-tight text-coffee-dark">Akses Portal Analisis</h3>
                  <p className="text-[10px] text-coffee-medium/85 font-semibold uppercase tracking-widest mt-0.5">Enterprise intelligence portal</p>
                </div>

                {/* Tab selections */}
                <div className="grid grid-cols-2 p-1 bg-stone-100 rounded-xl border border-latte/10">
                  <button
                    onClick={() => { setAuthTab('sandbox'); setError(null); }}
                    className={`py-2 text-center text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${authTab === 'sandbox' ? 'bg-white text-coffee-dark shadow-xs' : 'text-coffee-medium hover:text-coffee-dark'}`}
                  >
                    Sandbox Instan
                  </button>
                  <button
                    onClick={() => { setAuthTab('google'); setError(null); }}
                    className={`py-2 text-center text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${authTab === 'google' ? 'bg-white text-coffee-dark shadow-xs' : 'text-coffee-medium hover:text-coffee-dark'}`}
                  >
                    Google Cloud
                  </button>
                </div>

                {authTab === 'sandbox' ? (
                  <form onSubmit={handleSandboxLoginSubmit} className="flex flex-col gap-4">
                    <div className="p-3 bg-emerald-50/60 border border-emerald-200/40 rounded-xl text-left flex items-start gap-2.5">
                      <ShieldCheck size={16} className="text-emerald-800 shrink-0 mt-0.5" />
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">Rekomendasi Sandbox Iframe</span>
                        <span className="text-[9px] text-emerald-900/90 font-medium leading-relaxed">
                          Bypass pembatasan "Domain Tidak Sah" pada iframe secara instan. Isolasi multi-tenant tetap aktif via local state yang aman.
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1 text-left">
                      <label className="text-[9px] font-black uppercase tracking-wider text-coffee-medium">Alamat Email Professional</label>
                      <input
                        type="email"
                        required
                        placeholder="contoh: samuel@enterprise.com"
                        value={sandboxEmail}
                        onChange={(e) => setSandboxEmail(e.target.value)}
                        className="p-3 text-xs bg-stone-50 border border-latte/70 hover:border-coffee-medium/50 focus:border-coffee-medium focus:outline-hidden rounded-xl transition-all font-medium text-coffee-dark"
                      />
                    </div>

                    <div className="flex flex-col gap-1 text-left">
                      <label className="text-[9px] font-black uppercase tracking-wider text-coffee-medium">Nama Lengkap Anda</label>
                      <input
                        type="text"
                        required
                        placeholder="contoh: Samuel Alvincent"
                        value={sandboxName}
                        onChange={(e) => setSandboxName(e.target.value)}
                        className="p-3 text-xs bg-stone-50 border border-latte/70 hover:border-coffee-medium/50 focus:border-coffee-medium focus:outline-hidden rounded-xl transition-all font-medium text-coffee-dark"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3 bg-coffee-medium hover:bg-coffee-dark text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md shadow-coffee-medium/20 hover:shadow-lg cursor-pointer"
                    >
                      <Sparkles size={14} />
                      <span>Masuk Sesi Sandbox</span>
                    </button>
                  </form>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="p-3 bg-amber-50/70 border border-amber-200/50 rounded-xl text-left flex items-start gap-2.5">
                      <AlertCircle size={16} className="text-amber-800 shrink-0 mt-0.5" />
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-amber-800">Sinkronisasi Cloud Persisten</span>
                        <span className="text-[9px] text-amber-900/90 font-medium leading-relaxed">
                          Menyimpan sesi secara ril ke cloud Firestore. Jika tombol di bawah tidak merespons, harap whitelist domain pratinjau ini di konsol Firebase Anda.
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={handleLogin}
                      className="w-full py-3 bg-white border border-latte hover:border-coffee-medium/50 hover:bg-stone-50 text-coffee-dark rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-3 shadow-xs cursor-pointer"
                    >
                      {/* Inline Google G vector */}
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="#EA4335" d="M12 5.04c1.67 0 3.2.58 4.39 1.71l3.27-3.27C17.68 1.54 14.98 1 12 1 7.35 1 3.4 3.65 1.5 7.5l3.86 3C6.35 7.5l5.65-2.46z" />
                        <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.35H12v4.51h6.46c-.29 1.48-1.14 2.73-2.42 3.57v2.96h3.91c2.29-2.11 3.54-5.21 3.54-8.69z" />
                        <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.92l-3.91-2.96c-1.09.73-2.48 1.17-4.05 1.17-3.11 0-5.75-2.1-6.69-4.94l-3.86 3C3.4 20.35 7.35 23 12 23z" />
                        <path fill="#FBBC05" d="M5.31 13.35c-.24-.73-.38-1.5-.38-2.35s.14-1.62.38-2.35l-3.86-3C.56 7.4 0 9.64 0 12s.56 4.6 1.45 6.35l3.86-3z" />
                      </svg>
                      <span>Masuk dengan Google</span>
                    </button>
                  </div>
                )}
                
                {error && (
                  <div className="p-3 bg-red-50 text-red-700 text-[10px] font-bold uppercase tracking-wider rounded-xl border border-red-200/50 text-center animate-shake">
                    {error}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        <footer className="px-8 py-5 bg-white border-t border-latte flex flex-col md:flex-row justify-between items-center gap-4 text-[9px] opacity-65 uppercase tracking-wider font-semibold">
          <p>IntellectaBI &bull; DeepMind Intelligence Portal v2.5</p>
          <p>Didesain Secara Eksklusif Untuk Analisis Data Korporasi Multi-Tenant</p>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-bg-main overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-latte shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-2">
          {/* Hamburger toggle for Sidebar */}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-coffee-medium transition-colors cursor-pointer mr-1"
            title={isSidebarOpen ? "Sembunyikan Sidebar" : "Tampilkan Sidebar"}
            id="sidebar-toggle-btn"
          >
            <Menu size={18} />
          </button>
          
          <div className="w-8 h-8 bg-coffee-medium rounded-lg flex items-center justify-center text-white shadow-lg shadow-coffee-medium/20">
            <BrainCircuit size={20} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-coffee-dark">Intellecta<span className="text-coffee-medium">BI</span></h1>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Custom Save Dashboard Trigger */}
          {dashboard && (
            <button
              onClick={triggerSaveSessionDialog}
              className="bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-md hover:bg-emerald-800 transition-colors flex items-center gap-1.5 shadow-sm border border-emerald-800/40 cursor-pointer"
              id="save-dashboard-btn"
              title="Save snapshot to your workspace sidebar"
            >
              <Save size={13} />
              <span>Save Sesi</span>
            </button>
          )}

          {navConfig?.show_data_preview_btn && (
            <button
              onClick={() => setIsDataPreviewOpen(true)}
              className="bg-amber-950 text-white text-xs font-bold px-4 py-2 rounded-md hover:bg-amber-900 transition-colors flex items-center gap-2 shadow-sm border border-amber-900/40 cursor-pointer"
            >
              <TableIcon size={14} className="text-amber-300" />
              <span>{navConfig.preview_btn_label}</span>
            </button>
          )}
          

          <button 
            onClick={handleAnalyze}
            disabled={isAnalyzing || csvData.length === 0}
            className="bg-coffee-medium text-white text-xs font-bold px-4 py-2 rounded-md hover:bg-coffee-dark transition-colors disabled:opacity-50"
          >
            {isAnalyzing ? "Analysing..." : "Process AI Insights"}
          </button>
        </div>
      </header>

      {/* Outer Flex Container for Sidebar + Workspace */}
      <div className="flex flex-1 overflow-hidden" id="workspace-container">
        {/* Left Sidebar for History Management */}
        <aside 
          className={cn(
            "bg-white border-r border-latte/60 flex flex-col shrink-0 overflow-hidden shadow-xs transition-all duration-300",
            isSidebarOpen ? "w-72" : "w-0 border-r-0"
          )} 
          id="history-sidebar"
        >
          {/* Header Sidebar */}
          <div className="p-4 border-b border-latte/60 bg-slate-50/50 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database size={16} className="text-coffee-medium" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-coffee-dark">IntellectaBI Workspace</h2>
              </div>
              {historyList.length > 0 && (
                <span className="text-[9px] bg-coffee-medium/10 text-coffee-dark font-bold px-2 py-0.5 rounded-full">
                  {historyList.length} Sesi
                </span>
              )}
            </div>
            
            {/* [ + ] New Analysis Button */}
            <button
              onClick={resetState}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-coffee-medium hover:bg-coffee-dark text-white rounded-lg text-xs font-semibold cursor-pointer transition-all shadow-sm"
              id="new-analysis-header-btn"
              title="Buat sesi analisis baru dengan reset state"
            >
              <Plus size={14} />
              <span>[ + ] New Analysis</span>
            </button>
          </div>
          
          {/* Body Sidebar (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar" id="history-sessions-list">
            {historyList.length === 0 ? (
              <div className="text-center py-12 px-4 opacity-50">
                <LayoutDashboard size={28} className="mx-auto text-coffee-medium mb-2 opacity-60" />
                <p className="text-[11px] font-medium text-coffee-dark">Belum ada riwayat analisis.</p>
                <p className="text-[9px] mt-1 text-coffee-medium leading-relaxed">Sesi Anda tidak tersimpan otomatis. Selesai memproses data, klik "Save Sesi" di bagian atas untuk menyimpannya.</p>
              </div>
            ) : (
              historyList.map((session) => {
                const isActive = session.id === activeSessionId;
                const dateVal = session.session_info?.timestamp || session.id;
                const formattedDate = isNaN(Date.parse(dateVal))
                  ? "Sesi Baru"
                  : new Date(dateVal).toLocaleString('id-ID', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                return (
                  <div
                    key={session.id}
                    id={`session-item-${session.id}`}
                    onClick={() => handleSelectSession(session)}
                    className={cn(
                      "group relative p-3 rounded-xl border transition-all cursor-pointer text-left flex flex-col gap-1",
                      isActive
                        ? "bg-bg-main border-coffee-medium/80 shadow-xs ring-1 ring-coffee-medium/30"
                        : "bg-white border-latte/65 hover:border-coffee-medium/50 hover:bg-slate-50/40"
                    )}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className={cn(
                        "text-[11px] font-bold leading-tight line-clamp-2",
                        isActive ? "text-coffee-dark" : "text-coffee-dark/80"
                      )}>
                        {session.session_info?.suggested_name || session.id}
                      </p>
                      
                      {/* Delete Session Button */}
                      <button
                        onClick={(e) => handleDeleteSession(session.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 hover:text-red-600 rounded text-coffee-medium/60 transition-all cursor-pointer shrink-0"
                        title="Hapus Sesi"
                        id={`delete-session-btn-${session.id}`}
                      >
                        <X size={12} />
                      </button>
                    </div>
                    
                    <div className="flex items-center justify-between text-[9px] text-coffee-medium/80 mt-1 font-medium">
                      <span className="truncate max-w-[130px] font-semibold text-coffee-medium" title={session.fileName || 'Data Raw'}>
                        📄 {session.fileName || 'Data Raw'}
                      </span>
                      <span className="font-semibold text-right whitespace-nowrap text-coffee-medium">
                        {formattedDate}
                      </span>
                    </div>

                    {isActive && (
                      <div className="absolute left-0 top-3 bottom-3 w-1 bg-coffee-medium rounded-r" />
                    )}
                  </div>
                );
              })
            )}
          </div>
          
          {historyList.length > 0 && (
            <div className="px-3 py-2 border-t border-latte/60 bg-slate-50/15 animate-fade-in">
              <button
                id="clear-all-sessions-btn"
                onClick={async () => {
                  if (confirm("Hapus seluruh riwayat sesi analisis secara permanen dari database cloud?")) {
                    try {
                      const qStatus = query(collection(db, 'sessions'), where('userId', '==', currentUser?.uid));
                      const snap = await getDocs(qStatus);
                      const deletePromises = snap.docs.map(doc => deleteDoc(doc.ref));
                      await Promise.all(deletePromises);
                      setHistoryList([]);
                      resetState();
                    } catch (err: any) {
                      handleFirestoreError(err, OperationType.DELETE, 'sessions');
                    }
                  }
                }}
                className="w-full py-1.5 border border-dashed border-red-500/30 text-red-700 hover:bg-red-50 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Clear Semua Sesi Cloud
              </button>
            </div>
          )}

          {/* Footer Sidebar with toggle close switch & Authentic User Profile Card */}
          <div className="p-3 border-t border-latte/60 bg-slate-50 flex flex-col gap-2 shrink-0">
            {currentUser && (
              <div className="flex items-center justify-between gap-2 bg-white border border-latte/50 p-2 rounded-xl shadow-xs">
                <div className="flex items-center gap-2 overflow-hidden">
                  {currentUser.photoURL ? (
                    <img 
                      src={currentUser.photoURL} 
                      alt={currentUser.displayName || ''} 
                      className="w-7 h-7 rounded-full border border-latte/50 shrink-0" 
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-coffee-medium flex items-center justify-center text-white font-bold text-[10px] shrink-0 uppercase">
                      {currentUser.displayName?.charAt(0) || currentUser.email?.charAt(0) || 'U'}
                    </div>
                  )}
                  <div className="flex flex-col text-left overflow-hidden">
                    <span className="text-[10px] font-bold text-coffee-dark truncate">{currentUser.displayName || 'Enterprise User'}</span>
                    <span className="text-[8px] text-coffee-medium/85 truncate font-semibold">{currentUser.email}</span>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1 px-1.5 hover:bg-red-50 text-red-600 rounded-lg transition-all cursor-pointer flex items-center justify-center border-0 bg-transparent shrink-0"
                  title="Sign Out"
                  id="sign-out-btn"
                >
                  <LogOut size={13} />
                </button>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="flex items-center gap-1.5 px-2 py-1 hover:bg-slate-100 text-[10px] font-bold text-coffee-medium/80 hover:text-coffee-dark uppercase rounded transition-colors cursor-pointer"
                id="sidebar-footer-collapse-btn"
                title="Close Workspace Sidebar"
              >
                <ChevronRight className="rotate-180 text-coffee-medium" size={13} />
                <span>Sembunyikan</span>
              </button>
              <span className="text-[9px] text-coffee-medium/55 italic font-medium">Intellecta Workspace</span>
            </div>
          </div>
        </aside>

        {/* Scrollable Work Area containing main dashboard */}
        <div className="flex-1 overflow-y-auto flex flex-col" id="dashboard-work-area">
          <main className="p-6 flex flex-col gap-6 flex-1">
        {/* Top Section: Upload Banner */}
        <section className="shrink-0 w-full">
          <div 
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileUpload}
            className="w-full bg-latte/15 border-2 border-dashed border-coffee-medium/25 rounded-xl p-5 flex flex-col items-center justify-center text-center group cursor-pointer hover:bg-latte/25 transition-all min-h-[90px]"
          >
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" id="csv-upload" />
            <label htmlFor="csv-upload" className="cursor-pointer flex flex-col md:flex-row items-center justify-between gap-4 w-full px-2">
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 bg-coffee-medium/10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                  <FileUp size={18} className="text-coffee-medium" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-coffee-dark truncate max-w-[280px] sm:max-w-md">{fileName || "sales_report_2025.csv"}</p>
                  <p className="text-[9px] opacity-65 uppercase tracking-widest font-black mt-0.5">Drag & drop or click to upload new CSV dataset</p>
                </div>
              </div>
              {!dashboard && csvData.length > 0 && (
                <button 
                  onClick={handleAnalyze} 
                  className="bg-coffee-medium hover:bg-coffee-dark text-white font-black text-xs px-5 py-2.5 rounded-lg transition-all shadow-xs shrink-0 cursor-pointer"
                >
                  Run Intellecta v2.5 Now
                </button>
              )}
            </label>
          </div>
        </section>

        {/* Row 2: Wide, Responsive 5-column KPI Cards Grid */}
        <section className="shrink-0 w-full">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-5">
            {(allocatedKpis.length > 0 ? allocatedKpis : [
              { label: 'Total Baris', value: csvData.length > 0 ? csvData.length.toLocaleString() : '---' },
              { label: 'Total Kolom', value: headers.length > 0 ? headers.length.toLocaleString() : '---' },
              { label: 'Kolom Numerik', value: csvData.length > 0 ? numericColumns.length.toString() : '---' },
              { label: 'Rekomendasi KPI #1', value: '---' },
              { label: 'Rekomendasi KPI #2', value: '---' }
            ]).map((kpi: any, idx) => (
              <div key={idx} id={`kpi-card-${idx}`} className="dashboard-card p-4 flex flex-col justify-between hover:border-coffee-medium transition-all bg-white border border-latte/60 rounded-xl shadow-xs min-h-[190px] w-full">
                <div className="flex-1 flex flex-col justify-between h-full">
                  <div>
                    <p className="font-extrabold text-[10px] tracking-wider text-coffee-medium uppercase line-clamp-2 leading-tight" title={kpi.label}>
                      {kpi.label}
                    </p>
                    <p className="text-xl md:text-2xl font-black text-coffee-dark mt-2 truncate leading-none">{kpi.value}</p>
                  </div>
                  
                  {/* Self-service controls for KPI Card - Persistent & Neat */}
                  {kpi.card_id && (
                    <div className="mt-4 pt-3 w-full border-t border-latte/45 flex flex-col gap-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[8px] font-black tracking-widest text-coffee-medium/70 uppercase">Select Metric</span>
                        <select
                          value={kpi.current_metric}
                          onChange={(e) => handleKpiOverrideChange(kpi.card_id, 'metric', e.target.value)}
                          className="bg-slate-50 border border-latte/50 text-[9px] font-bold py-1 px-1.5 rounded-md outline-none hover:border-coffee-medium text-coffee-dark cursor-pointer w-full truncate"
                          title="Pilih Metrik Kolom"
                        >
                          {getKpiOptions(kpi.options || [], kpi.current_metric).map((opt: string) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[8px] font-black tracking-widest text-coffee-medium/70 uppercase">Agg</span>
                          <select
                            value={kpi.current_aggregation}
                            onChange={(e) => handleKpiOverrideChange(kpi.card_id, 'aggregation', e.target.value)}
                            className="bg-slate-50 border border-latte/50 text-[9px] font-bold py-1 px-1.5 rounded-md outline-none hover:border-coffee-medium text-coffee-dark cursor-pointer w-full"
                            title="Tipe Agregasi"
                          >
                            <option value="SUM">SUM</option>
                            <option value="AVERAGE">AVG</option>
                            <option value="COUNT">COUNT</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-0.5">
                          <span className="text-[8px] font-black tracking-widest text-coffee-medium/70 uppercase">Format</span>
                          <select
                            value={kpi.current_unit_prefix}
                            onChange={(e) => handleKpiOverrideChange(kpi.card_id, 'unitPrefix', e.target.value)}
                            className="bg-slate-50 border border-latte/50 text-[9px] font-bold py-1 px-1.5 rounded-md outline-none hover:border-coffee-medium text-coffee-dark cursor-pointer w-full"
                            title="Format Unit"
                          >
                            <option value="raw">raw</option>
                            <option value="k">k</option>
                            <option value="M">M</option>
                            <option value="B">B</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="h-1 bg-coffee-medium/10 rounded-full mt-3 overflow-hidden shrink-0">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: dashboard ? `${20 + (idx * 16)}%` : '5%' }}
                    className="h-full bg-coffee-medium"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Bottom Section: Insights & Content */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-[500px]">
          {/* Insights Panel */}
          <div className="col-span-1 lg:col-span-4 bg-coffee-dark text-latte p-6 rounded-xl flex flex-col h-full shadow-xl">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-6 h-6 bg-latte rounded-full flex items-center justify-center text-coffee-dark shadow-sm">
                <BrainCircuit size={14} className="animate-pulse" />
              </div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-latte">AI Analysis Insights</h2>
            </div>
            
            <div className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
              {error && (
                 <div className="bg-red-500/10 p-3 rounded-lg border border-red-500/20 text-red-200 text-[11px]">
                   <AlertCircle size={14} className="mb-1" />
                   {error}
                 </div>
              )}
              
              {!dashboard && !isAnalyzing && (
                <div className="opacity-40 text-center py-20 italic text-xs px-4">
                  Upload CSV and click "Process AI Insights" to generate strategy notes based on {fileName || "your data"}.
                </div>
              )}

              {isAnalyzing && (
                <div className="space-y-4">
                   {[1, 2, 3].map(i => (
                     <div key={i} className="bg-white/5 p-3 rounded-lg border border-white/10 animate-pulse">
                        <div className="h-3 w-2/3 bg-white/10 rounded mb-2" />
                        <div className="h-2 w-full bg-white/5 rounded" />
                     </div>
                   ))}
                </div>
              )}

              {(dashboard?.aiResult?.dashboard_data?.deep_analysis_insights || dashboard?.aiResult?.deep_analysis_insights || (dashboard?.aiResult as any)?.ai_insights || []).map((insight, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="bg-white/5 p-3 rounded-lg border border-white/10 group hover:border-latte/30 transition-colors"
                >
                  <h3 className="text-xs font-bold text-white mb-1 tracking-tight">Insight #{idx + 1}</h3>
                  <p className="text-[11px] leading-relaxed opacity-80">{insight}</p>
                </motion.div>
              ))}
            </div>

            <button className="mt-6 w-full bg-latte text-coffee-dark font-black text-xs py-3 rounded-lg shadow-lg hover:bg-white transition-colors uppercase tracking-widest">
              Export Strategy PDF
            </button>
          </div>

          {/* Charts & Table Area */}
          <div className="col-span-1 lg:col-span-8 flex flex-col gap-6 overflow-y-auto pr-1">
            {/* Active Filters Bar */}
            {dashboard && Object.keys(activeFilters).length > 0 && (
              <div className="flex flex-wrap gap-2 items-center bg-white p-3 rounded-xl border border-latte shadow-sm shrink-0">
                <span className="text-[10px] font-bold text-coffee-dark uppercase tracking-wider">Filter Aktif (Cross-Filter Mode):</span>
                {Object.entries(activeFilters).map(([col, val]) => (
                  <div key={col} id={`filter-badge-${col}`} className="flex items-center gap-1.5 bg-coffee-medium text-white px-2.5 py-1 rounded-md text-[10px] font-bold shadow-sm">
                    <span>{col}: <b className="underline">{val}</b></span>
                    <button 
                      className="hover:text-red-300 ml-1 font-extrabold focus:outline-none cursor-pointer"
                      onClick={() => setActiveFilters(prev => {
                        const updated = { ...prev };
                        delete updated[col];
                        return updated;
                      })}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button 
                  className="text-[9px] font-black text-coffee-dark hover:text-coffee-medium transition-colors uppercase ml-auto tracking-widest border border-dashed border-coffee-medium/30 px-2.5 py-1 rounded-md"
                  onClick={() => setActiveFilters({})}
                >
                  Reset Semua Filter
                </button>
              </div>
            )}

            {/* Dashboard Visual Area */}
            {!dashboard ? (
              <div className="flex-1 min-h-[350px] bg-white border border-latte rounded-xl p-8 flex flex-col items-center justify-center opacity-40">
                <BarChart3 size={64} className="text-coffee-medium mb-3 animate-pulse" />
                <p className="text-xs font-black uppercase text-coffee-dark tracking-[0.3em]">Visual Dashboard Locked</p>
                <p className="text-[10px] opacity-65 mt-1">Upload file CSV dan tekan tombol analisis untuk membuka rancangan Power BI.</p>
              </div>
            ) : (
              <div id="dynamic-dashboard-grid" className="flex flex-col gap-6">
                {aggregatedCharts.map((chartObj, idx) => {
                  const isLineLike = ['line', 'area'].includes(chartObj.activeType);
                  const isPieLike = ['pie', 'doughnut'].includes(chartObj.activeType);
                  
                  // Let's make first chart master style (full-width), others grid cards!
                  const isMaster = idx === 0;
                  const cardClass = isMaster 
                    ? "dashboard-card p-5 bg-white flex flex-col min-h-[340px] border border-latte/60 rounded-xl shadow-xs"
                    : "dashboard-card p-5 bg-white flex flex-col min-h-[300px] border border-latte/60 rounded-xl shadow-xs";

                  return (
                    <div 
                      key={chartObj.originalConfig.chart_id} 
                      id={`chart-card-${chartObj.originalConfig.chart_id}`}
                      className={cardClass}
                    >
                      <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
                        <div>
                          <div className="flex items-center flex-wrap gap-2 text-left">
                            <span className="text-[9px] font-bold text-white uppercase tracking-widest bg-coffee-medium px-2 py-0.5 rounded">
                              CHART #{idx + 1}
                            </span>
                            <span className="text-xs font-bold text-coffee-dark uppercase tracking-wider text-left">
                              {chartObj.config.title}
                            </span>
                          </div>
                          {chartObj.config.description && (
                            <p className="text-[10px] text-coffee-medium/70 mt-1 leading-relaxed max-w-xl text-left">
                              {chartObj.config.description}
                            </p>
                          )}
                        </div>

                        {/* Self-service BI controls inside each Chart Header */}
                        <div className="flex flex-wrap gap-2 items-center bg-slate-50 border border-latte/40 p-1 px-2 rounded-lg">
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] font-bold text-coffee-medium uppercase">X-Axis:</span>
                            <select
                              value={chartObj.activeX}
                              onChange={(e) => handleChartOverrideChange(chartObj.originalConfig.chart_id, 'x', e.target.value)}
                              className="bg-white border border-latte/60 text-[10px] font-bold p-1 rounded hover:border-coffee-medium outline-none cursor-pointer text-coffee-dark max-w-[120px]"
                            >
                              {getXOptions(chartObj.activeX, chartObj.activeType).map((field: string) => (
                                <option key={field} value={field}>{field}</option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center gap-1">
                            <span className="text-[9px] font-bold text-coffee-medium uppercase">Y-Axis:</span>
                            <select
                              value={chartObj.activeY}
                              onChange={(e) => handleChartOverrideChange(chartObj.originalConfig.chart_id, 'y', e.target.value)}
                              className="bg-white border border-latte/60 text-[10px] font-bold p-1 rounded hover:border-coffee-medium outline-none cursor-pointer text-coffee-dark max-w-[120px]"
                            >
                              {getYOptions(chartObj.activeY).map((field: string) => (
                                <option key={field} value={field}>{field}</option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center gap-1">
                            <span className="text-[9px] font-bold text-coffee-medium uppercase">Type:</span>
                            <select
                              value={chartObj.activeType}
                              onChange={(e) => handleChartOverrideChange(chartObj.originalConfig.chart_id, 'type', e.target.value)}
                              className="bg-white border border-latte/60 text-[10px] font-bold p-1 rounded hover:border-coffee-medium outline-none cursor-pointer text-coffee-dark"
                            >
                              {chartObj.originalConfig.supported_types.map((t: string) => (
                                <option key={t} value={t}>{t.toUpperCase()}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="flex-1 relative min-h-[220px]">
                        {isLineLike ? (
                          <Line 
                            data={chartObj.data}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: { legend: { display: false } },
                              scales: {
                                y: { grid: { color: 'rgba(223, 211, 195, 0.2)' }, ticks: { font: { size: 9, weight: 'bold' } } },
                                x: { grid: { display: false }, ticks: { font: { size: 9, weight: 'bold' } } }
                              },
                              onClick: (_event, elements) => {
                                if (elements && elements.length > 0) {
                                  const index = elements[0].index;
                                  const label = chartObj.data.labels[index];
                                  setActiveFilters(prev => {
                                    const updated = { ...prev };
                                    if (updated[chartObj.config.cross_filter_source] === label) {
                                      delete updated[chartObj.config.cross_filter_source];
                                    } else {
                                      updated[chartObj.config.cross_filter_source] = label;
                                    }
                                    return updated;
                                  });
                                }
                              }
                            }}
                          />
                        ) : isPieLike ? (
                          chartObj.activeType === 'pie' ? (
                            <Pie 
                              data={chartObj.data}
                              options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 9, weight: 'bold' } } } },
                                onClick: (_event, elements) => {
                                  if (elements && elements.length > 0) {
                                    const index = elements[0].index;
                                    const label = chartObj.data.labels[index];
                                    setActiveFilters(prev => {
                                      const updated = { ...prev };
                                      if (updated[chartObj.config.cross_filter_source] === label) {
                                        delete updated[chartObj.config.cross_filter_source];
                                      } else {
                                        updated[chartObj.config.cross_filter_source] = label;
                                      }
                                      return updated;
                                    });
                                  }
                                }
                              }}
                            />
                          ) : (
                            <Doughnut 
                              data={chartObj.data}
                              options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 9, weight: 'bold' } } } },
                                onClick: (_event, elements) => {
                                  if (elements && elements.length > 0) {
                                    const index = elements[0].index;
                                    const label = chartObj.data.labels[index];
                                    setActiveFilters(prev => {
                                      const updated = { ...prev };
                                      if (updated[chartObj.config.cross_filter_source] === label) {
                                        delete updated[chartObj.config.cross_filter_source];
                                      } else {
                                        updated[chartObj.config.cross_filter_source] = label;
                                      }
                                      return updated;
                                    });
                                  }
                                }
                              }}
                            />
                          )
                        ) : (
                          <Bar 
                            data={chartObj.data}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: { legend: { display: false } },
                              scales: {
                                y: { grid: { color: 'rgba(223, 211, 195, 0.2)' }, ticks: { font: { size: 9, weight: 'bold' } } },
                                x: { grid: { display: false }, ticks: { font: { size: 9, weight: 'bold' } } }
                              },
                              onClick: (_event, elements) => {
                                if (elements && elements.length > 0) {
                                  const index = elements[0].index;
                                  const label = chartObj.data.labels[index];
                                  setActiveFilters(prev => {
                                    const updated = { ...prev };
                                    if (updated[chartObj.config.cross_filter_source] === label) {
                                      delete updated[chartObj.config.cross_filter_source];
                                    } else {
                                      updated[chartObj.config.cross_filter_source] = label;
                                    }
                                    return updated;
                                  });
                                }
                              }
                            }}
                          />
                        )}
                      </div>
                      <div className="mt-2 text-right">
                        <span className="text-[10px] text-coffee-medium/80 italic font-medium whitespace-nowrap">
                          Klik titik/bar untuk melakukan cross-filter berdasarkan kolom: <b className="underline text-coffee-dark font-bold">{chartObj.config.cross_filter_source}</b>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Compact Preview Table */}
            {csvData.length > 0 && <CSVPreviewTable isDashboard={true} />}
          </div>
        </section>
          </main>
        </div>
      </div>

      <AnimatePresence>
        {isSaveModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-coffee-dark/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            id="save-session-modal-overlay"
            onClick={() => setIsSaveModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="bg-white rounded-2xl shadow-xl max-w-md w-full flex flex-col overflow-hidden border border-latte"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="bg-coffee-medium text-white px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Save size={16} />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-white">Simpan Sesi Analisis</h3>
                </div>
                <button
                  onClick={() => setIsSaveModalOpen(false)}
                  className="text-white hover:text-slate-200 transition-colors cursor-pointer border-0 bg-transparentp-1"
                  id="close-save-modal-btn"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 flex flex-col gap-4">
                <p className="text-[11px] text-coffee-medium leading-relaxed font-semibold">
                  Sesi analisis Anda akan disimpan ke dalam database cloud multi-tenant Firestore secara aman. Sesi ini terikat unik pada akun Google Anda dan dapat diakses kapan saja demi menjaga integritas workspace Anda.
                </p>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-coffee-dark">Nama Sesi Analisis</label>
                  <input
                    type="text"
                    className="w-full bg-slate-50 border border-latte rounded-lg p-2.5 text-xs text-coffee-dark outline-none focus:border-coffee-medium focus:ring-1 focus:ring-coffee-medium font-bold"
                    placeholder="Nama Sesi Analisis"
                    value={sessionSaveNameInput}
                    onChange={(e) => setSessionSaveNameInput(e.target.value)}
                    id="save-session-name-input"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-slate-50/50 border-t border-latte/65 flex items-center justify-end gap-2 shrink-0">
                <button
                  onClick={() => setIsSaveModalOpen(false)}
                  className="px-4 py-2 hover:bg-slate-100 border border-latte/70 text-xs font-bold text-coffee-medium/90 rounded-lg transition-colors cursor-pointer bg-transparent"
                  id="cancel-save-modal-btn"
                >
                  Batal
                </button>
                <button
                  onClick={handleSaveCurrentSessionSubmit}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-sm border border-emerald-800/35 flex items-center gap-1.5"
                  id="submit-save-modal-btn"
                >
                  <Save size={13} />
                  <span>Simpan Sesi</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {isDataPreviewOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-coffee-dark/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            id="full-data-preview-overlay"
            onClick={() => setIsDataPreviewOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-latte"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="bg-coffee-dark text-white px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-widest text-latte flex items-center gap-2">
                    <Database size={16} className="text-amber-300" />
                    Full Data Preview & Exploration Tool
                  </h2>
                  <p className="text-[10px] opacity-75 mt-0.5 leading-relaxed">
                    Eksplorasi data interaktif, pencarian multi-kolom, pengurutan, & ekspor file mentah: <span className="font-mono text-amber-200">{fileName || 'dataset.csv'}</span>
                  </p>
                </div>
                <button
                  onClick={() => setIsDataPreviewOpen(false)}
                  className="p-1 rounded-full text-latte/70 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Toolbar Controls */}
              <div className="bg-slate-50 border-b border-latte px-6 py-3 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3 w-full sm:w-auto flex-1 max-w-md">
                  <div className="relative w-full">
                    <input
                      type="text"
                      placeholder="Cari kata kunci pada seluruh kolom data..."
                      value={previewSearchQuery}
                      onChange={(e) => setPreviewSearchQuery(e.target.value)}
                      className="w-full bg-white border border-latte rounded-lg px-3 py-1.5 pl-9 text-xs focus:ring-1 focus:ring-coffee-medium outline-none"
                    />
                    <div className="absolute left-3 top-2.5 text-coffee-medium/50">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                      </svg>
                    </div>
                    {previewSearchQuery && (
                      <button
                        onClick={() => setPreviewSearchQuery('')}
                        className="absolute right-3 top-2 text-coffee-dark font-bold text-xs"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <span className="text-[11px] text-coffee-medium font-semibold">
                    {previewSearchQuery ? (
                      <>Ditemukan: <b className="text-coffee-dark font-black">{modalFilteredData.length}</b> baris dari {csvData.length}</>
                    ) : (
                      <>Total: <b className="text-coffee-dark font-black">{csvData.length}</b> baris &bull; <b className="text-coffee-dark font-black">{headers.length}</b> kolom</>
                    )}
                  </span>
                  
                  <button
                    onClick={handleExportCSV}
                    className="bg-white hover:bg-slate-100 text-coffee-dark text-[11px] font-bold px-3 py-1.5 rounded-lg border border-latte flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                  >
                    <FileUp size={12} className="rotate-180" />
                    <span>Unduh CSV Terbaru ({modalFilteredData.length})</span>
                  </button>
                </div>
              </div>

              {/* Table Body Area */}
              <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-100 text-coffee-dark uppercase tracking-wider text-[10px] font-bold sticky top-0 z-10 border-b border-latte shadow-sm">
                    <tr>
                      {headers.map(h => (
                        <th
                          key={h}
                          onClick={() => {
                            if (previewSortColumn === h) {
                              setPreviewSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                            } else {
                              setPreviewSortColumn(h);
                              setPreviewSortDirection('asc');
                            }
                          }}
                          className={cn(
                            "p-3 border-r border-latte/30 last:border-0 cursor-pointer select-none transition-colors",
                            previewSortColumn === h ? "bg-amber-100 text-coffee-dark" : "hover:bg-slate-200"
                          )}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span>{h}</span>
                            <span className="text-[8px] opacity-70">
                              {previewSortColumn === h ? (
                                previewSortDirection === 'asc' ? '▲' : '▼'
                              ) : '↕'}
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-latte/20">
                    {paginatedModalData.length > 0 ? (
                      paginatedModalData.map((row, i) => (
                        <tr
                          key={i}
                          className={cn(
                            "hover:bg-amber-50/40 transition-colors",
                            i % 2 === 1 ? "bg-slate-50/20" : "bg-white"
                          )}
                        >
                          {headers.map(h => (
                            <td key={h} className="p-3 border-r border-latte/20 last:border-0 font-medium text-coffee-dark">
                              {row[h] === null || row[h] === undefined ? <span className="opacity-30 italic">null</span> : String(row[h])}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={headers.length} className="text-center py-20 text-coffee-medium/75 italic">
                          Nama kolom, filter, atau kata kunci pencarian "{previewSearchQuery}" tidak cocok dengan data apapun.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Modal Footer (Pagination Controls) */}
              <div className="bg-slate-50 border-t border-latte px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-[11px] text-coffee-medium font-medium">
                  Menampilkan <span className="font-extrabold text-coffee-dark">{modalFilteredData.length > 0 ? (previewCurrentPage - 1) * modalPageSize + 1 : 0}</span> sampai{' '}
                  <span className="font-extrabold text-coffee-dark">{Math.min(previewCurrentPage * modalPageSize, modalFilteredData.length)}</span> dari{' '}
                  <span className="font-extrabold text-coffee-dark">{modalFilteredData.length}</span> data terfilter
                </p>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPreviewCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={previewCurrentPage === 1}
                    className="px-3 py-1.5 border border-latte rounded-lg bg-white text-[11px] font-black text-coffee-dark hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    Sebelumnya
                  </button>
                  
                  {Array.from({ length: Math.min(5, totalModalPages) }, (_, idx) => {
                    // Show pages around current page
                    let pageNum = idx + 1;
                    if (previewCurrentPage > 3 && totalModalPages > 5) {
                      pageNum = previewCurrentPage - 3 + idx;
                      if (pageNum + (4 - idx) > totalModalPages) {
                        pageNum = totalModalPages - 4 + idx;
                      }
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPreviewCurrentPage(pageNum)}
                        className={cn(
                          "w-7 h-7 rounded-lg text-[10px] font-bold transition-all cursor-pointer",
                          previewCurrentPage === pageNum
                            ? "bg-coffee-medium text-white shadow-sm"
                            : "bg-white border border-latte text-coffee-dark hover:bg-slate-100"
                        )}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => setPreviewCurrentPage(prev => Math.min(totalModalPages, prev + 1))}
                    disabled={previewCurrentPage === totalModalPages}
                    className="px-3 py-1.5 border border-latte rounded-lg bg-white text-[11px] font-black text-coffee-dark hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    Selanjutnya
                  </button>
                </div>

                <button
                  onClick={() => setIsDataPreviewOpen(false)}
                  className="bg-coffee-medium hover:bg-coffee-dark text-white text-[11px] font-black uppercase tracking-wider px-5 py-2 rounded-lg transition-colors cursor-pointer shadow"
                >
                  Selesai
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="px-6 py-2 bg-white border-t border-latte flex justify-between items-center text-[9px] opacity-60 uppercase tracking-tighter shrink-0">
        <p>IntellectaBI v2.5-Flash Build 09-2025 &bull; DeepMind Intelligence</p>
        <p className="font-bold">Powered by Gemini & PapaParse &bull; Secure Static Deployment</p>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(223, 211, 195, 0.2);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(223, 211, 195, 0.4);
        }
      `}</style>
    </div>
  );
}
