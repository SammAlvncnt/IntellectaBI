/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AnalysisSummary {
  rowCount: number;
  columns: string[];
  columnTypes: Record<string, 'numeric' | 'categoric'>;
  sampleData: any[];
}

export interface KPI {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export interface KpiCardConfig {
  card_id: string;
  current_label: string;
  current_metric: string;
  kpi_options: string[];
  aggregation_type?: 'SUM' | 'AVERAGE' | 'COUNT';
  format?: 'currency' | 'number' | 'percentage';
  unit_prefix?: string;
}

export interface SelfServiceChartConfig {
  chart_id: string;
  title: string;
  current_x: string;
  current_y: string;
  available_x_fields: string[];
  available_y_fields: string[];
  supported_types: string[];
  description?: string;
}

export interface NavigationConfig {
  show_data_preview_btn: boolean;
  preview_btn_label: string;
}

export interface SessionInfo {
  suggested_name: string;
  timestamp: string;
}

export interface DashboardDataWrapper {
  dashboard_title: string;
  navigation_config: NavigationConfig;
  deep_analysis_insights: string[];
  kpi_cards: KpiCardConfig[];
  charts_layout: SelfServiceChartConfig[];
}

export interface GeminiResponse {
  session_info: SessionInfo;
  dashboard_data: DashboardDataWrapper;
}

export interface DashboardData {
  summary: AnalysisSummary;
  aiResult: GeminiResponse;
  allocatedKpis: KPI[];
  aggregatedCharts: {
    config: SelfServiceChartConfig;
    data: {
      labels: string[];
      datasets: {
        label: string;
        data: number[];
        backgroundColor?: string | string[];
        borderColor?: string;
      }[];
    };
  }[];
}

export interface SavedSession {
  id: string;
  userId?: string;
  session_info: SessionInfo;
  fileName: string | null;
  csvData: any[];
  headers: string[];
  aiResult: GeminiResponse;
  kpiOverrides?: Record<string, any>;
  chartOverrides?: Record<string, any>;
  activeFilters?: Record<string, string>;
}

