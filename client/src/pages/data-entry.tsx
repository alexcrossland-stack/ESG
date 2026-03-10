import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardList, Lock, Save, Leaf, Users, Shield,
  AlertCircle, Calculator, CheckCircle2, Zap, Info,
  Upload, Download, FileSpreadsheet, Table,
} from "lucide-react";
import { format, subMonths } from "date-fns";
import * as XLSX from "xlsx";

const RAW_DATA_FIELDS = {
  environmental: [
    { key: "electricity_kwh", label: "Electricity Consumption", unit: "kWh", help: "Total electricity from utility bills" },
    { key: "gas_kwh", label: "Gas / Fuel Consumption", unit: "kWh", help: "Natural gas from gas bills" },
    { key: "vehicle_fuel_litres", label: "Company Vehicle Fuel", unit: "litres", help: "Total fuel purchased for company vehicles" },
    { key: "total_waste_tonnes", label: "Total Waste Generated", unit: "tonnes", help: "Total waste from collection records" },
    { key: "recycled_waste_tonnes", label: "Recycled Waste", unit: "tonnes", help: "Waste sent for recycling" },
    { key: "water_m3", label: "Water Consumption", unit: "m³", help: "Water from utility bills" },
    { key: "domestic_flight_km", label: "Domestic Flights", unit: "km", help: "Total domestic flight distance" },
    { key: "short_haul_flight_km", label: "Short-Haul Flights", unit: "km", help: "Short-haul flight distance (<3,700km)" },
    { key: "long_haul_flight_km", label: "Long-Haul Flights", unit: "km", help: "Long-haul flight distance (>3,700km)" },
    { key: "rail_km", label: "Rail Travel", unit: "km", help: "Business rail travel distance" },
    { key: "hotel_nights", label: "Hotel Nights", unit: "nights", help: "Business hotel stays" },
    { key: "car_miles", label: "Business Car Miles", unit: "miles", help: "Business car mileage" },
  ],
  social: [
    { key: "employee_headcount", label: "Employee Headcount", unit: "people", help: "Total employees at period end" },
    { key: "employee_leavers", label: "Employee Leavers", unit: "people", help: "Staff who left during period" },
    { key: "absence_days", label: "Absence Days", unit: "days", help: "Total sick/absence days" },
    { key: "total_working_days", label: "Total Working Days", unit: "days", help: "Total available working days" },
    { key: "total_training_hours", label: "Total Training Hours", unit: "hours", help: "All training hours delivered" },
    { key: "female_managers", label: "Female Managers", unit: "people", help: "Women in management positions" },
    { key: "total_managers", label: "Total Managers", unit: "people", help: "Total management positions" },
    { key: "living_wage_employees", label: "Living Wage Employees", unit: "people", help: "Employees paid at or above living wage" },
  ],
  governance: [
    { key: "trained_staff", label: "Privacy-Trained Staff", unit: "people", help: "Staff who completed data privacy training" },
    { key: "total_staff", label: "Total Staff (for training %)", unit: "people", help: "Total staff for training completion %" },
    { key: "signed_suppliers", label: "Suppliers Signed CoC", unit: "suppliers", help: "Suppliers who signed code of conduct" },
    { key: "total_suppliers", label: "Total Suppliers", unit: "suppliers", help: "Total number of suppliers" },
  ],
};

const AUTO_CALC_METRICS = [
  "Scope 1 Emissions", "Scope 2 Emissions", "Recycling Rate", "Business Travel Emissions",
  "Carbon Intensity", "Employee Turnover Rate", "Absence Rate", "Training Hours per Employee",
  "Management Gender Diversity", "Living Wage Coverage", "Data Privacy Training Completion",
  "Supplier Code of Conduct Adoption",
];

function generatePeriods() {
  const periods = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = subMonths(now, i);
    periods.push(format(d, "yyyy-MM"));
  }
  return periods;
}

const CATEGORY_ICONS = {
  environmental: { icon: Leaf, color: "text-primary", bg: "bg-primary/10", label: "Environmental" },
  social: { icon: Users, color: "text-blue-500", bg: "bg-blue-500/10", label: "Social" },
  governance: { icon: Shield, color: "text-purple-500", bg: "bg-purple-500/10", label: "Governance" },
};

export default function DataEntry() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const periods = generatePeriods();
  const [selectedPeriod, setSelectedPeriod] = useState(periods[0]);
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState("raw");
  const [recalcResults, setRecalcResults] = useState<any[] | null>(null);
  const [manualValues, setManualValues] = useState<Record<string, { value: string; notes: string }>>({});

  const { data: rawData, isLoading: rawLoading } = useQuery<any[]>({
    queryKey: ["/api/raw-data", selectedPeriod],
    queryFn: () => {
        return fetch(`/api/raw-data/${selectedPeriod}`, { credentials: "include" }).then(r => r.json());
      },
  });

  const { data: entryData, isLoading: entryLoading } = useQuery<any>({
    queryKey: ["/api/data-entry", selectedPeriod],
    queryFn: () => {
        return fetch(`/api/data-entry/${selectedPeriod}`, { credentials: "include" }).then(r => r.json());
      },
  });

  useEffect(() => {
    if (rawData && Array.isArray(rawData)) {
      const inputs: Record<string, string> = {};
      rawData.forEach((d: any) => {
        inputs[d.inputName] = d.value ? String(Number(d.value)) : "";
      });
      setRawInputs(inputs);
    }
  }, [rawData]);

  useEffect(() => {
    if (entryData?.values) {
      const vals: Record<string, { value: string; notes: string }> = {};
      entryData.values.forEach((v: any) => {
        vals[v.metricId] = { value: v.value ? String(Number(v.value)) : "", notes: v.notes || "" };
      });
      setManualValues(vals);
    }
  }, [entryData]);

  const saveRawMutation = useMutation({
    mutationFn: (data: { inputs: Record<string, string>; period: string }) =>
      apiRequest("POST", "/api/raw-data", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/raw-data", selectedPeriod] });
      toast({ title: "Raw data saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const recalcMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/metrics/recalculate/${selectedPeriod}`, {}).then(r => r.json()),
    onSuccess: (data: any) => {
      setRecalcResults(data.updated || []);
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry", selectedPeriod] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/enhanced"] });
      toast({ title: "Metrics recalculated", description: `${data.updated?.length || 0} metrics updated` });
    },
    onError: (e: any) => toast({ title: "Recalculation failed", description: e.message, variant: "destructive" }),
  });

  const saveManualMutation = useMutation({
    mutationFn: (data: { metricId: string; period: string; value: string; notes: string }) =>
      apiRequest("POST", "/api/data-entry", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry", selectedPeriod] });
    },
  });

  const lockMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/data-entry/${selectedPeriod}/lock`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry", selectedPeriod] });
      toast({ title: `Period ${selectedPeriod} locked` });
    },
  });

  const handleSaveRawAndRecalc = async () => {
    const nonEmpty: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawInputs)) {
      if (v !== undefined && v !== null && v.trim() !== "") nonEmpty[k] = v;
    }
    await saveRawMutation.mutateAsync({ inputs: nonEmpty, period: selectedPeriod });
    await recalcMutation.mutateAsync();
  };

  const handleSaveManual = async (metricId: string) => {
    const val = manualValues[metricId];
    if (!val?.value) return;
    await saveManualMutation.mutateAsync({ metricId, period: selectedPeriod, value: val.value, notes: val.notes });
    toast({ title: "Saved" });
  };

  const isLoading = rawLoading || entryLoading;
  if (isLoading) {
    return <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;
  }

  const metrics = entryData?.metrics || [];
  const existingValues = entryData?.values || [];
  const isLocked = existingValues.some((v: any) => v.locked);
  const manualMetrics = metrics.filter((m: any) => m.metricType === "manual" || !m.metricType);

  const filledRawCount = Object.values(rawInputs).filter(v => v !== undefined && v !== null && v !== "").length;
  const totalRawFields = Object.values(RAW_DATA_FIELDS).reduce((sum, fields) => sum + fields.length, 0);
  const rawCompletion = Math.round((filledRawCount / totalRawFields) * 100);

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            Data Entry
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Enter raw data and record manual metric values
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-36" data-testid="select-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periods.map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isLocked ? (
            <Badge variant="secondary" className="gap-1">
              <Lock className="w-3 h-3" />
              Locked
            </Badge>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => lockMutation.mutate()}
              disabled={lockMutation.isPending}
              data-testid="button-lock-period-header"
            >
              <Lock className="w-3.5 h-3.5 mr-1.5" />
              {lockMutation.isPending ? "Locking..." : "Lock Period"}
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="raw" data-testid="tab-raw-data">
            <Calculator className="w-3.5 h-3.5 mr-1.5" />
            Raw Data
          </TabsTrigger>
          <TabsTrigger value="manual" data-testid="tab-manual-entry">
            <ClipboardList className="w-3.5 h-3.5 mr-1.5" />
            Manual
          </TabsTrigger>
          <TabsTrigger value="upload" data-testid="tab-excel-upload">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />
            Excel Upload
          </TabsTrigger>
        </TabsList>

        <TabsContent value="raw" className="mt-4 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md border border-border">
            <div className="flex-1">
              <p className="text-sm font-medium">Raw Data Completion</p>
              <p className="text-xs text-muted-foreground">{filledRawCount} of {totalRawFields} fields entered</p>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-primary">{rawCompletion}%</div>
            </div>
          </div>

          <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
            <Calculator className="w-4 h-4 text-blue-500" />
            <AlertDescription className="text-sm">
              Enter your raw operational data below. When you save, the following metrics will be automatically calculated:{" "}
              <span className="font-medium">{AUTO_CALC_METRICS.join(", ")}</span>
            </AlertDescription>
          </Alert>

          {(Object.entries(RAW_DATA_FIELDS) as [keyof typeof CATEGORY_ICONS, typeof RAW_DATA_FIELDS.environmental][]).map(([cat, fields]) => {
            const config = CATEGORY_ICONS[cat];
            const Icon = config.icon;

            return (
              <Card key={cat}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <div className={`p-1.5 rounded-md ${config.bg}`}>
                      <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                    </div>
                    {config.label} Inputs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {fields.map(field => (
                      <div key={field.key} className="space-y-1.5" data-testid={`raw-field-${field.key}`}>
                        <Label className="text-sm flex items-center gap-1.5">
                          {field.label}
                          <span className="text-xs text-muted-foreground">({field.unit})</span>
                        </Label>
                        <Input
                          type="number"
                          step="any"
                          value={rawInputs[field.key] || ""}
                          onChange={e => setRawInputs(prev => ({ ...prev, [field.key]: e.target.value }))}
                          placeholder={`Enter ${field.unit}`}
                          disabled={isLocked}
                          className="h-8 text-sm"
                          data-testid={`input-raw-${field.key}`}
                        />
                        <p className="text-xs text-muted-foreground">{field.help}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {!isLocked && (
            <div className="flex justify-end gap-2">
              <Button
                onClick={handleSaveRawAndRecalc}
                disabled={saveRawMutation.isPending || recalcMutation.isPending}
                data-testid="button-save-recalculate"
              >
                <Calculator className="w-4 h-4 mr-2" />
                {saveRawMutation.isPending || recalcMutation.isPending ? "Calculating..." : "Save & Calculate Metrics"}
              </Button>
            </div>
          )}

          {recalcResults && recalcResults.length > 0 && (
            <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  Calculated Results
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {recalcResults.map((r: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-white dark:bg-emerald-950/30 rounded border border-emerald-100 dark:border-emerald-900">
                      <span className="text-sm">{r.metric}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{typeof r.value === "number" ? r.value.toFixed(2) : r.value}</span>
                        <div className={`w-2 h-2 rounded-full ${r.status === "green" ? "bg-emerald-500" : r.status === "amber" ? "bg-amber-500" : "bg-red-500"}`} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="manual" className="mt-4 space-y-4">
          <Alert>
            <Info className="w-4 h-4" />
            <AlertDescription className="text-sm">
              These are manual metrics that cannot be auto-calculated. Enter values directly below.
            </AlertDescription>
          </Alert>

          {isLocked && (
            <Alert>
              <Lock className="w-4 h-4" />
              <AlertDescription>
                This period is locked. Data cannot be edited.
              </AlertDescription>
            </Alert>
          )}

          {(["environmental", "social", "governance"] as const).map(cat => {
            const catMetrics = manualMetrics.filter((m: any) => m.category === cat);
            if (catMetrics.length === 0) return null;
            const config = CATEGORY_ICONS[cat];
            const Icon = config.icon;

            return (
              <Card key={cat}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <div className={`p-1.5 rounded-md ${config.bg}`}>
                      <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                    </div>
                    {config.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {catMetrics.map((metric: any) => {
                    const localVal = manualValues[metric.metricId] || { value: "", notes: "" };
                    const hasValue = localVal.value && localVal.value !== "";

                    return (
                      <div
                        key={metric.metricId}
                        className={`grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 p-3 rounded-md border ${hasValue ? "border-primary/20 bg-primary/5" : "border-border"}`}
                        data-testid={`manual-row-${metric.metricId}`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Label className="text-sm font-medium">{metric.name}</Label>
                            <Badge variant="outline" className="text-xs">{metric.unit || "—"}</Badge>
                            {hasValue && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
                          </div>
                          {metric.helpText && (
                            <p className="text-xs text-muted-foreground">{metric.helpText}</p>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Value</Label>
                              <Input
                                type="number"
                                step="any"
                                value={localVal.value}
                                onChange={e => setManualValues(prev => ({
                                  ...prev,
                                  [metric.metricId]: { ...prev[metric.metricId] || { notes: "" }, value: e.target.value }
                                }))}
                                placeholder={`Enter ${metric.unit || "value"}`}
                                disabled={isLocked}
                                className="h-8 text-sm"
                                data-testid={`input-manual-${metric.metricId}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Notes</Label>
                              <Input
                                value={localVal.notes}
                                onChange={e => setManualValues(prev => ({
                                  ...prev,
                                  [metric.metricId]: { ...prev[metric.metricId] || { value: "" }, notes: e.target.value }
                                }))}
                                placeholder="Optional note"
                                disabled={isLocked}
                                className="h-8 text-sm"
                                data-testid={`input-notes-${metric.metricId}`}
                              />
                            </div>
                          </div>
                        </div>
                        {!isLocked && (
                          <div className="flex items-end">
                            <Button
                              size="sm"
                              variant={hasValue ? "secondary" : "default"}
                              onClick={() => handleSaveManual(metric.metricId)}
                              disabled={saveManualMutation.isPending || !localVal.value}
                              data-testid={`button-save-manual-${metric.metricId}`}
                            >
                              <Save className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}

          {manualMetrics.length === 0 && (
            <div className="text-center py-12">
              <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No manual metrics to enter.</p>
            </div>
          )}

        </TabsContent>

        <TabsContent value="upload" className="mt-4 space-y-4">
          <ExcelUploadTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ExcelUploadTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedData, setParsedData] = useState<{ name: string; period: string; value: number }[] | null>(null);
  const [previewRows, setPreviewRows] = useState<Record<string, Record<string, number | null>>>({});
  const [previewPeriods, setPreviewPeriods] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [unmatchedNames, setUnmatchedNames] = useState<string[]>([]);

  const { data: templateData } = useQuery<{ rows: string[]; periods: string[]; categories: { raw: string[]; manual: string[] } }>({
    queryKey: ["/api/data-entry/template"],
  });

  const uploadMutation = useMutation({
    mutationFn: (rows: { name: string; period: string; value: number }[]) =>
      apiRequest("POST", "/api/data-entry/bulk-upload", { rows }).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/raw-data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/enhanced"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      toast({
        title: "Upload complete",
        description: `${data.rawSaved} raw inputs, ${data.metricSaved} metrics saved. ${data.skipped} skipped. ${data.periodsRecalculated} periods recalculated.`,
      });
      setParsedData(null);
      setPreviewRows({});
      setPreviewPeriods([]);
      setFileName("");
      setUnmatchedNames([]);
    },
    onError: (e: any) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const handleDownloadTemplate = () => {
    if (!templateData?.periods || !templateData?.categories) return;
    const ws_data: (string | number | null)[][] = [];
    const headerRow = ["Metric / Input", ...templateData.periods];
    ws_data.push(headerRow);

    ws_data.push(["--- RAW DATA INPUTS ---", ...templateData.periods.map(() => null)]);
    for (const name of templateData.categories.raw) {
      ws_data.push([name, ...templateData.periods.map(() => null)]);
    }
    ws_data.push(["--- MANUAL METRICS ---", ...templateData.periods.map(() => null)]);
    for (const name of templateData.categories.manual) {
      ws_data.push([name, ...templateData.periods.map(() => null)]);
    }

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const colWidths = [{ wch: 35 }, ...templateData.periods.map(() => ({ wch: 12 }))];
    ws["!cols"] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ESG Data");
    XLSX.writeFile(wb, "esg_data_template.xlsx");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });

        if (jsonData.length < 2) {
          toast({ title: "Empty spreadsheet", description: "No data rows found", variant: "destructive" });
          return;
        }

        const headers = (jsonData[0] as any[]).map((h: any) => String(h || "").trim());
        const periodColumns: { index: number; period: string }[] = [];
        for (let i = 1; i < headers.length; i++) {
          const h = headers[i];
          const match = h.match(/^(\d{4})-(\d{2})$/);
          if (match) {
            periodColumns.push({ index: i, period: h });
          }
        }

        if (periodColumns.length === 0) {
          toast({
            title: "No period columns found",
            description: "Column headers should be in YYYY-MM format (e.g. 2025-01, 2025-02)",
            variant: "destructive",
          });
          return;
        }

        const allNames = new Set((templateData?.rows || []).map(r => r.toLowerCase()));
        const rows: { name: string; period: string; value: number }[] = [];
        const preview: Record<string, Record<string, number | null>> = {};
        const unmatched = new Set<string>();
        const periods = periodColumns.map(p => p.period);

        for (let r = 1; r < jsonData.length; r++) {
          const row = jsonData[r] as any[];
          const name = String(row[0] || "").trim();
          if (!name || name.startsWith("---")) continue;

          preview[name] = {};
          const isKnown = allNames.has(name.toLowerCase());
          if (!isKnown) unmatched.add(name);

          for (const pc of periodColumns) {
            const cellValue = row[pc.index];
            if (cellValue !== undefined && cellValue !== null && cellValue !== "" && !isNaN(Number(cellValue))) {
              rows.push({ name, period: pc.period, value: Number(cellValue) });
              preview[name][pc.period] = Number(cellValue);
            } else {
              preview[name][pc.period] = null;
            }
          }
        }

        setParsedData(rows);
        setPreviewRows(preview);
        setPreviewPeriods(periods);
        setUnmatchedNames([...unmatched]);

        toast({ title: `Parsed ${rows.length} data points from ${Object.keys(preview).length} rows` });
      } catch (err: any) {
        toast({ title: "Failed to parse file", description: err.message, variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const dataPointCount = parsedData?.length || 0;
  const rowCount = Object.keys(previewRows).length;

  return (
    <div className="space-y-4">
      <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
        <FileSpreadsheet className="w-4 h-4 text-blue-500" />
        <AlertDescription className="text-sm">
          Upload an Excel file with metric names down the left column and monthly periods (YYYY-MM) across the top.
          This allows you to upload historical and ongoing data in bulk.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadTemplate}
          disabled={!templateData}
          data-testid="button-download-template"
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          Download Template
        </Button>

        <Button
          variant={parsedData ? "outline" : "default"}
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          data-testid="button-choose-file"
        >
          <Upload className="w-3.5 h-3.5 mr-1.5" />
          {fileName ? "Choose Different File" : "Choose Excel File"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFileChange}
          data-testid="input-file-upload"
        />
      </div>

      {parsedData && parsedData.length > 0 && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Table className="w-4 h-4 text-primary" />
                Preview: {fileName}
              </CardTitle>
              <CardDescription className="text-xs">
                {rowCount} rows, {previewPeriods.length} periods, {dataPointCount} data points
              </CardDescription>
            </CardHeader>
            <CardContent>
              {unmatchedNames.length > 0 && (
                <Alert variant="destructive" className="mb-3">
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription className="text-xs">
                    {unmatchedNames.length} row(s) not matched to known metrics and will be skipped:{" "}
                    <span className="font-medium">{unmatchedNames.join(", ")}</span>
                  </AlertDescription>
                </Alert>
              )}

              <div className="overflow-x-auto border rounded-md">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left p-2 font-medium sticky left-0 bg-muted/50 min-w-[180px]">Metric / Input</th>
                      {previewPeriods.map(p => (
                        <th key={p} className="text-right p-2 font-medium min-w-[80px]">{p}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(previewRows).map(([name, periods]) => {
                      const isUnmatched = unmatchedNames.includes(name);
                      return (
                        <tr key={name} className={`border-b last:border-0 ${isUnmatched ? "bg-red-50 dark:bg-red-950/20 opacity-60" : "hover:bg-muted/30"}`}>
                          <td className={`p-2 font-medium sticky left-0 bg-background ${isUnmatched ? "bg-red-50 dark:bg-red-950/20 line-through" : ""}`}>
                            {name}
                          </td>
                          {previewPeriods.map(p => (
                            <td key={p} className="text-right p-2 tabular-nums">
                              {periods[p] != null ? periods[p]!.toLocaleString() : <span className="text-muted-foreground">-</span>}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {dataPointCount - (unmatchedNames.length > 0 ? parsedData.filter(r => unmatchedNames.includes(r.name)).length : 0)} data points will be uploaded
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setParsedData(null); setPreviewRows({}); setPreviewPeriods([]); setFileName(""); setUnmatchedNames([]); }}
                data-testid="button-clear-upload"
              >
                Clear
              </Button>
              <Button
                size="sm"
                onClick={() => uploadMutation.mutate(parsedData)}
                disabled={uploadMutation.isPending}
                data-testid="button-upload-data"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                {uploadMutation.isPending ? "Uploading..." : "Upload Data"}
              </Button>
            </div>
          </div>
        </>
      )}

      {parsedData && parsedData.length === 0 && (
        <Alert>
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>No numeric data found in the file. Make sure values are in the cells.</AlertDescription>
        </Alert>
      )}

      <Card className="bg-muted/30">
        <CardContent className="pt-4">
          <h3 className="text-sm font-medium mb-2">Expected Format</h3>
          <div className="overflow-x-auto border rounded-md bg-background">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left p-2 font-medium">Metric / Input</th>
                  <th className="text-right p-2 font-medium">2025-01</th>
                  <th className="text-right p-2 font-medium">2025-02</th>
                  <th className="text-right p-2 font-medium">2025-03</th>
                  <th className="text-right p-2 font-medium">...</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b"><td className="p-2">Electricity Consumption</td><td className="text-right p-2 text-muted-foreground">45200</td><td className="text-right p-2 text-muted-foreground">43800</td><td className="text-right p-2 text-muted-foreground">41500</td><td className="text-right p-2">...</td></tr>
                <tr className="border-b"><td className="p-2">Gas / Fuel Consumption</td><td className="text-right p-2 text-muted-foreground">12400</td><td className="text-right p-2 text-muted-foreground">11800</td><td className="text-right p-2 text-muted-foreground">9600</td><td className="text-right p-2">...</td></tr>
                <tr className="border-b"><td className="p-2">Employee Headcount</td><td className="text-right p-2 text-muted-foreground">48</td><td className="text-right p-2 text-muted-foreground">50</td><td className="text-right p-2 text-muted-foreground">51</td><td className="text-right p-2">...</td></tr>
                <tr><td className="p-2">Lost Time Incidents</td><td className="text-right p-2 text-muted-foreground">1</td><td className="text-right p-2 text-muted-foreground">0</td><td className="text-right p-2 text-muted-foreground">0</td><td className="text-right p-2">...</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Row names should match the labels shown in Raw Data Inputs or your metric names.
            Empty cells will be skipped. Column headers must be in YYYY-MM format.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
