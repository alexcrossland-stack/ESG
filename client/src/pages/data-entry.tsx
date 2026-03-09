import { useState, useEffect } from "react";
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
} from "lucide-react";
import { format, subMonths } from "date-fns";

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
        const token = sessionStorage.getItem("auth_token");
        const headers: Record<string, string> = token ? { "x-auth-token": token } : {};
        return fetch(`/api/raw-data/${selectedPeriod}`, { credentials: "include", headers }).then(r => r.json());
      },
  });

  const { data: entryData, isLoading: entryLoading } = useQuery<any>({
    queryKey: ["/api/data-entry", selectedPeriod],
    queryFn: () => {
        const token = sessionStorage.getItem("auth_token");
        const headers: Record<string, string> = token ? { "x-auth-token": token } : {};
        return fetch(`/api/data-entry/${selectedPeriod}`, { credentials: "include", headers }).then(r => r.json());
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
            Raw Data Inputs
          </TabsTrigger>
          <TabsTrigger value="manual" data-testid="tab-manual-entry">
            <ClipboardList className="w-3.5 h-3.5 mr-1.5" />
            Manual Metrics
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
      </Tabs>
    </div>
  );
}
