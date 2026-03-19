import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSiteContext } from "@/hooks/use-site-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calculator, Zap, Fuel, Car, Plane, Train, Hotel, Users, Leaf, Factory,
  Globe, BarChart3, Info, ChevronDown, ChevronUp, Download, FileText,
  AlertTriangle, CheckCircle2, HelpCircle, Building,
} from "lucide-react";
import type { CarbonCalculation, EmissionFactor } from "@shared/schema";
import { usePermissions } from "@/lib/permissions";

type CarbonInputs = {
  electricity: string;
  gas: string;
  diesel: string;
  petrol: string;
  lpg: string;
  vehicleMileage: string;
  vehicleFuelType: string;
  domesticFlights: string;
  shortHaulFlights: string;
  longHaulFlights: string;
  railTravel: string;
  hotelNights: string;
  floorAreaM2: string;
};

type DataQualityMap = Record<string, "actual" | "estimated" | "proxy">;

type MethodologyNote = {
  source: string;
  scope: number;
  calculation: string;
  methodology: string;
  factorSource: string;
  factorYear: number;
  dataQuality: string;
  fuelType?: string;
  assumptions?: string[];
};

type EnhancedResults = {
  breakdown: Record<string, number>;
  lineItems: MethodologyNote[];
  factorYear: number;
  dataQuality: Record<string, string>;
  assumptions: string[];
};

type CalculationResult = CarbonCalculation & {
  results: EnhancedResults;
  factorYear?: number;
  methodologyNotes?: MethodologyNote[];
  assumptions?: string[];
};

const defaultInputs: CarbonInputs = {
  electricity: "", gas: "", diesel: "", petrol: "", lpg: "",
  vehicleMileage: "", vehicleFuelType: "",
  domesticFlights: "", shortHaulFlights: "", longHaulFlights: "",
  railTravel: "", hotelNights: "", floorAreaM2: "",
};

const DQ_COLORS: Record<string, string> = {
  actual: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  estimated: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  proxy: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

function DataQualityBadge({ quality }: { quality: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${DQ_COLORS[quality] || DQ_COLORS.actual}`}>
      {quality}
    </span>
  );
}

function formatEmissions(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(2)} tCO2e`;
  return `${value.toFixed(1)} kgCO2e`;
}

function generatePeriodOptions() {
  const now = new Date();
  const options: string[] = [];
  const start = new Date(2020, 0, 1);
  let d = new Date(now.getFullYear(), now.getMonth(), 1);
  while (d >= start) {
    options.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  }
  return options;
}

const PERIOD_OPTIONS = generatePeriodOptions();

const BREAKDOWN_CONFIG: { key: string; label: string; color: string }[] = [
  { key: "electricity", label: "Electricity", color: "bg-yellow-500" },
  { key: "gas", label: "Natural Gas", color: "bg-orange-500" },
  { key: "diesel", label: "Diesel", color: "bg-red-500" },
  { key: "petrol", label: "Petrol", color: "bg-rose-500" },
  { key: "lpg", label: "LPG", color: "bg-pink-500" },
  { key: "vehicles", label: "Vehicles", color: "bg-purple-500" },
  { key: "domesticFlights", label: "Domestic Flights", color: "bg-blue-500" },
  { key: "shortHaulFlights", label: "Short-haul Flights", color: "bg-sky-500" },
  { key: "longHaulFlights", label: "Long-haul Flights", color: "bg-indigo-500" },
  { key: "rail", label: "Rail", color: "bg-emerald-500" },
  { key: "hotelNights", label: "Hotel Nights", color: "bg-teal-500" },
];

const VEHICLE_FUEL_OPTIONS = [
  { value: "", label: "Average (mixed fleet)" },
  { value: "diesel", label: "Diesel" },
  { value: "petrol", label: "Petrol" },
  { value: "hybrid", label: "Hybrid" },
  { value: "electric", label: "Electric" },
];

function DataQualitySelector({ value, onChange, fieldKey }: { value: string; onChange: (key: string, val: string) => void; fieldKey: string }) {
  return (
    <Select value={value || "actual"} onValueChange={(v) => onChange(fieldKey, v)}>
      <SelectTrigger className="h-6 w-24 text-xs" data-testid={`dq-${fieldKey}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="actual">Actual</SelectItem>
        <SelectItem value="estimated">Estimated</SelectItem>
        <SelectItem value="proxy">Proxy</SelectItem>
      </SelectContent>
    </Select>
  );
}

function InputField({ id, label, icon: Icon, unit, value, onChange, helpText, disabled, dataQuality, onDqChange }: {
  id: string; label: string; icon: any; unit: string; value: string;
  onChange: (val: string) => void; helpText: string; disabled: boolean;
  dataQuality: string; onDqChange: (key: string, val: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        {label} ({unit})
      </Label>
      <Input
        id={id} type="number" value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0" min={0} disabled={disabled}
        data-testid={`input-${id}`}
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{helpText}</p>
        <DataQualitySelector value={dataQuality} onChange={onDqChange} fieldKey={id} />
      </div>
    </div>
  );
}

export default function CarbonCalculator() {
  const { toast } = useToast();
  const { can } = usePermissions();
  const canEdit = can("metrics_data_entry");
  const { activeSiteId } = useSiteContext();
  const [inputs, setInputs] = useState<CarbonInputs>(defaultInputs);
  const [reportingPeriod, setReportingPeriod] = useState(PERIOD_OPTIONS[0]);
  const [periodType, setPeriodType] = useState("monthly");
  const [employeeCount, setEmployeeCount] = useState("");
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [showFactors, setShowFactors] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [dataQuality, setDataQuality] = useState<DataQualityMap>({});

  const { data: factors, isLoading: factorsLoading } = useQuery<EmissionFactor[]>({
    queryKey: ["/api/carbon/factors"],
  });

  const { data: history, isLoading: historyLoading } = useQuery<CalculationResult[]>({
    queryKey: ["/api/carbon/calculations"],
  });

  const calculateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", "/api/carbon/calculate", payload);
      return res.json();
    },
    onSuccess: (data: CalculationResult) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/carbon/calculations"] });
      toast({ title: "Calculation complete", description: "Your carbon footprint has been estimated." });
    },
    onError: (err: Error) => {
      toast({ title: "Calculation failed", description: err.message, variant: "destructive" });
    },
  });

  const handleCalculate = () => {
    const numericInputs: Record<string, any> = {};
    for (const [key, val] of Object.entries(inputs)) {
      if (key === "vehicleFuelType") {
        numericInputs[key] = val || null;
      } else {
        numericInputs[key] = val ? parseFloat(val) : 0;
      }
    }
    calculateMutation.mutate({
      inputs: numericInputs,
      reportingPeriod,
      periodType,
      employeeCount: employeeCount ? parseInt(employeeCount, 10) : null,
      dataQuality,
      siteId: activeSiteId || undefined,
    });
  };

  const handleInputChange = (field: keyof CarbonInputs, value: string) => {
    setInputs((prev) => ({ ...prev, [field]: value }));
  };

  const handleDqChange = (key: string, val: string) => {
    setDataQuality((prev) => ({ ...prev, [key]: val as any }));
  };

  const handleExport = (calcId: string) => {
    window.open(`/api/carbon/calculations/${calcId}/export`, "_blank");
  };

  const scope1 = result ? parseFloat(String(result.scope1Total || "0")) : 0;
  const scope2 = result ? parseFloat(String(result.scope2Total || "0")) : 0;
  const scope3 = result ? parseFloat(String(result.scope3Total || "0")) : 0;
  const total = result ? parseFloat(String(result.totalEmissions || "0")) : 0;
  const empCount = result?.employeeCount || (employeeCount ? parseInt(employeeCount) : 0);
  const perEmployee = empCount > 0 ? total / empCount : 0;
  const resultFactorYear = result?.factorYear || result?.results?.factorYear || 2024;
  const methodNotes: MethodologyNote[] = result?.methodologyNotes || result?.results?.lineItems || [];
  const resultAssumptions: string[] = result?.assumptions || result?.results?.assumptions || [];
  const resultDq = result?.results?.dataQuality || {};

  const breakdown = result?.results?.breakdown;
  const maxBreakdown = breakdown
    ? Math.max(...Object.values(breakdown).map((v) => (typeof v === "number" ? v : 0)), 1)
    : 1;

  const hasProxyInputs = inputs.floorAreaM2 && parseFloat(inputs.floorAreaM2) > 0;
  const hasActualElec = inputs.electricity && parseFloat(inputs.electricity) > 0;
  const hasActualGas = inputs.gas && parseFloat(inputs.gas) > 0;

  const dqSummary = Object.values(resultDq);
  const actualCount = dqSummary.filter(d => d === "actual").length;
  const estimatedCount = dqSummary.filter(d => d === "estimated").length;
  const proxyCount = dqSummary.filter(d => d === "proxy").length;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2" data-testid="text-page-title">
            <Calculator className="w-5 h-5 text-primary" />
            Carbon Estimator
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Estimate your organisation's carbon footprint across Scope 1, 2 and 3
          </p>
        </div>
        <Badge variant="outline" className="text-xs" data-testid="badge-factor-year">
          Factor Year: {(factors as any)?.[0]?.factorYear || 2024}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Reporting Period</Label>
          <Select value={reportingPeriod} onValueChange={setReportingPeriod}>
            <SelectTrigger className="w-36" data-testid="select-reporting-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Period Type</Label>
          <Select value={periodType} onValueChange={setPeriodType}>
            <SelectTrigger className="w-36" data-testid="select-period-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="annual">Annual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Employees</Label>
          <Input
            type="number" value={employeeCount}
            onChange={(e) => setEmployeeCount(e.target.value)}
            placeholder="Employee count" className="w-36" min={0}
            data-testid="input-employee-count"
          />
        </div>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-md border border-border bg-muted/30">
        <HelpCircle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p>For each input, select the data quality: <DataQualityBadge quality="actual" /> for metered/invoiced values, <DataQualityBadge quality="estimated" /> for values calculated from partial data, or <DataQualityBadge quality="proxy" /> for industry benchmarks.</p>
          <p>If you don't have actual energy data, enter your floor area below to use proxy estimates.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10">
              <Zap className="w-3.5 h-3.5 text-primary" />
            </div>
            Energy & Fuel
          </CardTitle>
          <CardDescription>Enter your energy consumption and fuel usage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <InputField id="electricity" label="Electricity" icon={Zap} unit="kWh"
              value={inputs.electricity} onChange={(v) => handleInputChange("electricity", v)}
              helpText="Total electricity consumed" disabled={!canEdit}
              dataQuality={dataQuality.electricity || "actual"} onDqChange={handleDqChange} />
            <InputField id="gas" label="Natural Gas" icon={Fuel} unit="kWh"
              value={inputs.gas} onChange={(v) => handleInputChange("gas", v)}
              helpText="Natural gas consumed" disabled={!canEdit}
              dataQuality={dataQuality.gas || "actual"} onDqChange={handleDqChange} />
            <InputField id="diesel" label="Diesel" icon={Fuel} unit="litres"
              value={inputs.diesel} onChange={(v) => handleInputChange("diesel", v)}
              helpText="Diesel fuel purchased" disabled={!canEdit}
              dataQuality={dataQuality.diesel || "actual"} onDqChange={handleDqChange} />
            <InputField id="petrol" label="Petrol" icon={Fuel} unit="litres"
              value={inputs.petrol} onChange={(v) => handleInputChange("petrol", v)}
              helpText="Petrol fuel purchased" disabled={!canEdit}
              dataQuality={dataQuality.petrol || "actual"} onDqChange={handleDqChange} />
            <InputField id="lpg" label="LPG" icon={Fuel} unit="litres"
              value={inputs.lpg} onChange={(v) => handleInputChange("lpg", v)}
              helpText="LPG fuel purchased" disabled={!canEdit}
              dataQuality={dataQuality.lpg || "actual"} onDqChange={handleDqChange} />
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5 text-muted-foreground" />
                Vehicle Mileage (miles)
              </Label>
              <Input
                type="number" value={inputs.vehicleMileage}
                onChange={(e) => handleInputChange("vehicleMileage", e.target.value)}
                placeholder="0" min={0} disabled={!canEdit}
                data-testid="input-vehicleMileage"
              />
              <div className="flex items-center gap-2">
                <Select value={inputs.vehicleFuelType} onValueChange={(v) => handleInputChange("vehicleFuelType", v)}>
                  <SelectTrigger className="h-6 text-xs flex-1" data-testid="select-vehicle-fuel-type">
                    <SelectValue placeholder="Fuel type" />
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_FUEL_OPTIONS.map((o) => (
                      <SelectItem key={o.value || "avg"} value={o.value || "avg"}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DataQualitySelector value={dataQuality.vehicleMileage || "actual"} onChange={handleDqChange} fieldKey="vehicleMileage" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-blue-500/10">
              <Plane className="w-3.5 h-3.5 text-blue-500" />
            </div>
            Business Travel
          </CardTitle>
          <CardDescription>Enter business travel distances and hotel stays</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <InputField id="domesticFlights" label="Domestic Flights" icon={Plane} unit="passenger-km"
              value={inputs.domesticFlights} onChange={(v) => handleInputChange("domesticFlights", v)}
              helpText="Total domestic flight distance" disabled={!canEdit}
              dataQuality={dataQuality.domesticFlights || "actual"} onDqChange={handleDqChange} />
            <InputField id="shortHaulFlights" label="Short-haul Flights" icon={Plane} unit="passenger-km"
              value={inputs.shortHaulFlights} onChange={(v) => handleInputChange("shortHaulFlights", v)}
              helpText="Short-haul international flights" disabled={!canEdit}
              dataQuality={dataQuality.shortHaulFlights || "actual"} onDqChange={handleDqChange} />
            <InputField id="longHaulFlights" label="Long-haul Flights" icon={Globe} unit="passenger-km"
              value={inputs.longHaulFlights} onChange={(v) => handleInputChange("longHaulFlights", v)}
              helpText="Long-haul international flights" disabled={!canEdit}
              dataQuality={dataQuality.longHaulFlights || "actual"} onDqChange={handleDqChange} />
            <InputField id="railTravel" label="Rail Travel" icon={Train} unit="passenger-km"
              value={inputs.railTravel} onChange={(v) => handleInputChange("railTravel", v)}
              helpText="Total rail travel distance" disabled={!canEdit}
              dataQuality={dataQuality.railTravel || "actual"} onDqChange={handleDqChange} />
            <InputField id="hotelNights" label="Hotel Nights" icon={Hotel} unit="nights"
              value={inputs.hotelNights} onChange={(v) => handleInputChange("hotelNights", v)}
              helpText="Number of hotel nights" disabled={!canEdit}
              dataQuality={dataQuality.hotelNights || "actual"} onDqChange={handleDqChange} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-purple-500/10">
              <Building className="w-3.5 h-3.5 text-purple-500" />
            </div>
            Proxy Inputs
            <Badge variant="outline" className="text-xs ml-1">Optional</Badge>
          </CardTitle>
          <CardDescription>Use these when actual energy data is unavailable. Proxy values will only be used if the actual field is empty.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-muted-foreground" />
                Office Floor Area (m2)
              </Label>
              <Input
                type="number" value={inputs.floorAreaM2}
                onChange={(e) => handleInputChange("floorAreaM2", e.target.value)}
                placeholder="0" min={0} disabled={!canEdit}
                data-testid="input-floorAreaM2"
              />
              <p className="text-xs text-muted-foreground">
                {hasProxyInputs && !hasActualElec && "Will estimate electricity from floor area (120 kWh/m2/yr)"}
                {hasProxyInputs && hasActualElec && "Actual electricity entered - proxy will not be used"}
                {!hasProxyInputs && "Enter floor area to generate proxy energy estimates"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleCalculate} disabled={calculateMutation.isPending || !canEdit} data-testid="button-calculate">
          <Calculator className="w-4 h-4 mr-1.5" />
          {calculateMutation.isPending ? "Calculating..." : "Calculate Emissions"}
        </Button>
        <Button variant="outline" onClick={() => { setInputs(defaultInputs); setResult(null); setDataQuality({}); }} disabled={!canEdit} data-testid="button-reset">
          Reset
        </Button>
      </div>

      {result && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card data-testid="card-scope1">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Scope 1</CardTitle>
                <Factory className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-scope1-value">{formatEmissions(scope1)}</div>
                <p className="text-xs text-muted-foreground mt-1">Direct emissions (gas, fuel, vehicles)</p>
              </CardContent>
            </Card>
            <Card data-testid="card-scope2">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Scope 2</CardTitle>
                <Zap className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-scope2-value">{formatEmissions(scope2)}</div>
                <p className="text-xs text-muted-foreground mt-1">Indirect emissions (electricity)</p>
              </CardContent>
            </Card>
            <Card data-testid="card-scope3">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Scope 3 (Travel)</CardTitle>
                <Plane className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-scope3-value">{formatEmissions(scope3)}</div>
                <p className="text-xs text-muted-foreground mt-1">Business travel & hotels</p>
              </CardContent>
            </Card>
            <Card data-testid="card-total">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
                <Leaf className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary" data-testid="text-total-value">{formatEmissions(total)}</div>
                {empCount > 0 && (
                  <p className="text-xs text-muted-foreground mt-1" data-testid="text-per-employee">
                    <Users className="w-3 h-3 inline mr-1" />
                    {formatEmissions(perEmployee)} per employee
                  </p>
                )}
              </CardContent>
            </Card>
            <Card data-testid="card-data-quality-summary">
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Data Quality</CardTitle>
                <Info className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {actualCount > 0 && <div className="flex items-center gap-1.5 text-xs"><CheckCircle2 className="w-3 h-3 text-emerald-500" />{actualCount} actual</div>}
                  {estimatedCount > 0 && <div className="flex items-center gap-1.5 text-xs"><AlertTriangle className="w-3 h-3 text-amber-500" />{estimatedCount} estimated</div>}
                  {proxyCount > 0 && <div className="flex items-center gap-1.5 text-xs"><HelpCircle className="w-3 h-3 text-purple-500" />{proxyCount} proxy</div>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Factor year: {resultFactorYear}</p>
              </CardContent>
            </Card>
          </div>

          {breakdown && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-primary/10">
                    <BarChart3 className="w-3.5 h-3.5 text-primary" />
                  </div>
                  Emissions Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {BREAKDOWN_CONFIG.map(({ key, label, color }) => {
                    const val = typeof breakdown[key] === "number" ? breakdown[key] : 0;
                    if (val === 0) return null;
                    const pct = (val / maxBreakdown) * 100;
                    const dqVal = resultDq[key];
                    return (
                      <div key={key} className="space-y-1" data-testid={`breakdown-${key}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{label}</span>
                            {dqVal && <DataQualityBadge quality={dqVal} />}
                          </div>
                          <span className="text-sm font-medium">{formatEmissions(val)}</span>
                        </div>
                        <div className="h-2 w-full bg-muted rounded-md overflow-hidden">
                          <div className={`h-full rounded-md ${color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {methodNotes.length > 0 && (
            <div className="space-y-2">
              <Button variant="ghost" size="sm" onClick={() => setShowMethodology(!showMethodology)} data-testid="button-toggle-methodology">
                {showMethodology ? <ChevronUp className="w-4 h-4 mr-1.5" /> : <ChevronDown className="w-4 h-4 mr-1.5" />}
                {showMethodology ? "Hide" : "Show"} Methodology Notes
              </Button>
              {showMethodology && (
                <Card data-testid="card-methodology">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary" />
                      Calculation Methodology
                    </CardTitle>
                    <CardDescription>Detailed breakdown of how each emission source was calculated</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {methodNotes.map((note, i) => (
                        <div key={i} className="p-3 rounded-md border border-border space-y-1.5" data-testid={`methodology-note-${i}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{note.source}</span>
                              <Badge variant="outline" className="text-xs">Scope {note.scope}</Badge>
                              <DataQualityBadge quality={note.dataQuality} />
                            </div>
                          </div>
                          <p className="text-xs font-mono text-muted-foreground">{note.calculation}</p>
                          <p className="text-xs text-muted-foreground">{note.methodology}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>Source: {note.factorSource} ({note.factorYear})</span>
                            {note.fuelType && <span>Fuel: {note.fuelType}</span>}
                          </div>
                          {note.assumptions && note.assumptions.length > 0 && (
                            <div className="mt-1 p-2 rounded bg-amber-50 dark:bg-amber-900/20 text-xs">
                              <span className="font-medium text-amber-700 dark:text-amber-400">Assumptions: </span>
                              {note.assumptions.join("; ")}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {resultAssumptions.length > 0 && (
            <div className="space-y-2">
              <Button variant="ghost" size="sm" onClick={() => setShowAssumptions(!showAssumptions)} data-testid="button-toggle-assumptions">
                {showAssumptions ? <ChevronUp className="w-4 h-4 mr-1.5" /> : <ChevronDown className="w-4 h-4 mr-1.5" />}
                {showAssumptions ? "Hide" : "Show"} Assumptions ({resultAssumptions.length})
              </Button>
              {showAssumptions && (
                <Card data-testid="card-assumptions">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      Assumptions & Limitations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5">
                      {resultAssumptions.map((a, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="mt-1 w-1 h-1 rounded-full bg-muted-foreground shrink-0" />
                          {a}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            {result.id && (
              <Button variant="outline" size="sm" onClick={() => handleExport(result.id)} data-testid="button-export-result">
                <Download className="w-4 h-4 mr-1.5" />
                Export Report
              </Button>
            )}
          </div>

          <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-md border border-border">
            <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground" data-testid="text-disclaimer">
              These calculations are estimates based on UK DEFRA {resultFactorYear} emission factors and should be reviewed before use in formal disclosures. Data quality indicators show the reliability of each input.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => setShowFactors(!showFactors)} data-testid="button-toggle-factors">
          {showFactors ? <ChevronUp className="w-4 h-4 mr-1.5" /> : <ChevronDown className="w-4 h-4 mr-1.5" />}
          {showFactors ? "Hide" : "Show"} Emission Factors
        </Button>
        {showFactors && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Emission Factors</CardTitle>
              <CardDescription>UK DEFRA {(factors as any)?.[0]?.factorYear || 2024} factors used in calculations</CardDescription>
            </CardHeader>
            <CardContent>
              {factorsLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8" />)}
                </div>
              ) : factors && factors.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Factor (kgCO2e)</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead>Fuel Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {factors.map((f: any) => (
                      <TableRow key={f.id} data-testid={`factor-row-${f.id}`}>
                        <TableCell className="text-sm">{f.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{f.category}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{f.unit}</TableCell>
                        <TableCell className="text-sm font-medium">{f.factor}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{f.factorYear || 2024}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{f.fuelType || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No emission factors loaded.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10">
              <BarChart3 className="w-3.5 h-3.5 text-primary" />
            </div>
            Calculation History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : history && history.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Scope 1</TableHead>
                  <TableHead>Scope 2</TableHead>
                  <TableHead>Scope 3</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Factor Year</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((calc: any, idx: number) => (
                  <TableRow key={calc.id || idx} data-testid={`history-row-${calc.id || idx}`}>
                    <TableCell className="text-sm font-medium">{calc.reportingPeriod}</TableCell>
                    <TableCell className="text-sm">{formatEmissions(parseFloat(String(calc.scope1Total || "0")))}</TableCell>
                    <TableCell className="text-sm">{formatEmissions(parseFloat(String(calc.scope2Total || "0")))}</TableCell>
                    <TableCell className="text-sm">{formatEmissions(parseFloat(String(calc.scope3Total || "0")))}</TableCell>
                    <TableCell className="text-sm font-medium">{formatEmissions(parseFloat(String(calc.totalEmissions || "0")))}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{calc.factorYear || "2024"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {calc.createdAt ? new Date(calc.createdAt).toLocaleDateString() : "N/A"}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => handleExport(calc.id)} data-testid={`button-export-${calc.id}`}>
                        <Download className="w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">No calculations yet. Enter your data above and calculate to get started.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
