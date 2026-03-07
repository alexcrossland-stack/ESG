import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calculator,
  Zap,
  Fuel,
  Car,
  Plane,
  Train,
  Hotel,
  Users,
  Leaf,
  Factory,
  Globe,
  BarChart3,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { CarbonCalculation, EmissionFactor } from "@shared/schema";

type CarbonInputs = {
  electricity: string;
  gas: string;
  diesel: string;
  petrol: string;
  vehicleMileage: string;
  domesticFlights: string;
  shortHaulFlights: string;
  longHaulFlights: string;
  railTravel: string;
  hotelNights: string;
};

type BreakdownResult = {
  electricity: number;
  gas: number;
  diesel: number;
  petrol: number;
  vehicles: number;
  domesticFlights: number;
  shortHaulFlights: number;
  longHaulFlights: number;
  rail: number;
  hotelNights: number;
};

type CalculationResult = CarbonCalculation & {
  results: {
    breakdown: BreakdownResult;
  };
};

const defaultInputs: CarbonInputs = {
  electricity: "",
  gas: "",
  diesel: "",
  petrol: "",
  vehicleMileage: "",
  domesticFlights: "",
  shortHaulFlights: "",
  longHaulFlights: "",
  railTravel: "",
  hotelNights: "",
};

function formatEmissions(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} tCO2e`;
  }
  return `${value.toFixed(1)} kgCO2e`;
}

function generatePeriodOptions() {
  const now = new Date();
  const options: string[] = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return options;
}

const PERIOD_OPTIONS = generatePeriodOptions();

const BREAKDOWN_CONFIG: { key: keyof BreakdownResult; label: string; color: string }[] = [
  { key: "electricity", label: "Electricity", color: "bg-yellow-500" },
  { key: "gas", label: "Natural Gas", color: "bg-orange-500" },
  { key: "diesel", label: "Diesel", color: "bg-red-500" },
  { key: "petrol", label: "Petrol", color: "bg-rose-500" },
  { key: "vehicles", label: "Vehicles", color: "bg-purple-500" },
  { key: "domesticFlights", label: "Domestic Flights", color: "bg-blue-500" },
  { key: "shortHaulFlights", label: "Short-haul Flights", color: "bg-sky-500" },
  { key: "longHaulFlights", label: "Long-haul Flights", color: "bg-indigo-500" },
  { key: "rail", label: "Rail", color: "bg-emerald-500" },
  { key: "hotelNights", label: "Hotel Nights", color: "bg-teal-500" },
];

export default function CarbonCalculator() {
  const { toast } = useToast();
  const [inputs, setInputs] = useState<CarbonInputs>(defaultInputs);
  const [reportingPeriod, setReportingPeriod] = useState(PERIOD_OPTIONS[0]);
  const [periodType, setPeriodType] = useState("monthly");
  const [employeeCount, setEmployeeCount] = useState("");
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [showFactors, setShowFactors] = useState(false);

  const { data: factors, isLoading: factorsLoading } = useQuery<EmissionFactor[]>({
    queryKey: ["/api/carbon/factors"],
  });

  const { data: history, isLoading: historyLoading } = useQuery<CalculationResult[]>({
    queryKey: ["/api/carbon/calculations"],
  });

  const calculateMutation = useMutation({
    mutationFn: async (payload: {
      inputs: Record<string, number>;
      reportingPeriod: string;
      periodType: string;
      employeeCount: number | null;
    }) => {
      const res = await apiRequest("POST", "/api/carbon/calculate", payload);
      return res.json();
    },
    onSuccess: (data: CalculationResult) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/carbon/calculations"] });
      toast({ title: "Calculation complete", description: "Your carbon footprint has been calculated." });
    },
    onError: (err: Error) => {
      toast({ title: "Calculation failed", description: err.message, variant: "destructive" });
    },
  });

  const handleCalculate = () => {
    const numericInputs: Record<string, number> = {};
    for (const [key, val] of Object.entries(inputs)) {
      numericInputs[key] = val ? parseFloat(val) : 0;
    }
    calculateMutation.mutate({
      inputs: numericInputs,
      reportingPeriod,
      periodType,
      employeeCount: employeeCount ? parseInt(employeeCount, 10) : null,
    });
  };

  const handleInputChange = (field: keyof CarbonInputs, value: string) => {
    setInputs((prev) => ({ ...prev, [field]: value }));
  };

  const scope1 = result ? parseFloat(String(result.scope1Total || "0")) : 0;
  const scope2 = result ? parseFloat(String(result.scope2Total || "0")) : 0;
  const scope3 = result ? parseFloat(String(result.scope3Total || "0")) : 0;
  const total = result ? parseFloat(String(result.totalEmissions || "0")) : 0;
  const empCount = result?.employeeCount || (employeeCount ? parseInt(employeeCount) : 0);
  const perEmployee = empCount > 0 ? total / empCount : 0;

  const breakdown = result?.results?.breakdown;
  const maxBreakdown = breakdown
    ? Math.max(...Object.values(breakdown).map((v) => (typeof v === "number" ? v : 0)), 1)
    : 1;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2" data-testid="text-page-title">
            <Calculator className="w-5 h-5 text-primary" />
            Carbon Calculator
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Estimate your organisation's carbon footprint across Scope 1, 2 and 3
          </p>
        </div>
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
            type="number"
            value={employeeCount}
            onChange={(e) => setEmployeeCount(e.target.value)}
            placeholder="Employee count"
            className="w-36"
            min={0}
            data-testid="input-employee-count"
          />
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
            <div className="space-y-1.5">
              <Label htmlFor="electricity" className="text-sm font-medium flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                Electricity (kWh)
              </Label>
              <Input
                id="electricity"
                type="number"
                value={inputs.electricity}
                onChange={(e) => handleInputChange("electricity", e.target.value)}
                placeholder="0"
                min={0}
                data-testid="input-electricity"
              />
              <p className="text-xs text-muted-foreground">Total electricity consumed</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gas" className="text-sm font-medium flex items-center gap-1.5">
                <Fuel className="w-3.5 h-3.5 text-muted-foreground" />
                Natural Gas (kWh)
              </Label>
              <Input
                id="gas"
                type="number"
                value={inputs.gas}
                onChange={(e) => handleInputChange("gas", e.target.value)}
                placeholder="0"
                min={0}
                data-testid="input-gas"
              />
              <p className="text-xs text-muted-foreground">Natural gas consumed</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="diesel" className="text-sm font-medium flex items-center gap-1.5">
                <Fuel className="w-3.5 h-3.5 text-muted-foreground" />
                Diesel (litres)
              </Label>
              <Input
                id="diesel"
                type="number"
                value={inputs.diesel}
                onChange={(e) => handleInputChange("diesel", e.target.value)}
                placeholder="0"
                min={0}
                data-testid="input-diesel"
              />
              <p className="text-xs text-muted-foreground">Diesel fuel purchased</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="petrol" className="text-sm font-medium flex items-center gap-1.5">
                <Fuel className="w-3.5 h-3.5 text-muted-foreground" />
                Petrol (litres)
              </Label>
              <Input
                id="petrol"
                type="number"
                value={inputs.petrol}
                onChange={(e) => handleInputChange("petrol", e.target.value)}
                placeholder="0"
                min={0}
                data-testid="input-petrol"
              />
              <p className="text-xs text-muted-foreground">Petrol fuel purchased</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vehicleMileage" className="text-sm font-medium flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5 text-muted-foreground" />
                Vehicle Mileage (miles)
              </Label>
              <Input
                id="vehicleMileage"
                type="number"
                value={inputs.vehicleMileage}
                onChange={(e) => handleInputChange("vehicleMileage", e.target.value)}
                placeholder="0"
                min={0}
                data-testid="input-vehicle-mileage"
              />
              <p className="text-xs text-muted-foreground">Company vehicle mileage</p>
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
            <div className="space-y-1.5">
              <Label htmlFor="domesticFlights" className="text-sm font-medium flex items-center gap-1.5">
                <Plane className="w-3.5 h-3.5 text-muted-foreground" />
                Domestic Flights (passenger-km)
              </Label>
              <Input
                id="domesticFlights"
                type="number"
                value={inputs.domesticFlights}
                onChange={(e) => handleInputChange("domesticFlights", e.target.value)}
                placeholder="0"
                min={0}
                data-testid="input-domestic-flights"
              />
              <p className="text-xs text-muted-foreground">Total domestic flight distance</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shortHaulFlights" className="text-sm font-medium flex items-center gap-1.5">
                <Plane className="w-3.5 h-3.5 text-muted-foreground" />
                Short-haul Flights (passenger-km)
              </Label>
              <Input
                id="shortHaulFlights"
                type="number"
                value={inputs.shortHaulFlights}
                onChange={(e) => handleInputChange("shortHaulFlights", e.target.value)}
                placeholder="0"
                min={0}
                data-testid="input-short-haul-flights"
              />
              <p className="text-xs text-muted-foreground">Short-haul international flights</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="longHaulFlights" className="text-sm font-medium flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                Long-haul Flights (passenger-km)
              </Label>
              <Input
                id="longHaulFlights"
                type="number"
                value={inputs.longHaulFlights}
                onChange={(e) => handleInputChange("longHaulFlights", e.target.value)}
                placeholder="0"
                min={0}
                data-testid="input-long-haul-flights"
              />
              <p className="text-xs text-muted-foreground">Long-haul international flights</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="railTravel" className="text-sm font-medium flex items-center gap-1.5">
                <Train className="w-3.5 h-3.5 text-muted-foreground" />
                Rail Travel (passenger-km)
              </Label>
              <Input
                id="railTravel"
                type="number"
                value={inputs.railTravel}
                onChange={(e) => handleInputChange("railTravel", e.target.value)}
                placeholder="0"
                min={0}
                data-testid="input-rail-travel"
              />
              <p className="text-xs text-muted-foreground">Total rail travel distance</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hotelNights" className="text-sm font-medium flex items-center gap-1.5">
                <Hotel className="w-3.5 h-3.5 text-muted-foreground" />
                Hotel Nights
              </Label>
              <Input
                id="hotelNights"
                type="number"
                value={inputs.hotelNights}
                onChange={(e) => handleInputChange("hotelNights", e.target.value)}
                placeholder="0"
                min={0}
                data-testid="input-hotel-nights"
              />
              <p className="text-xs text-muted-foreground">Number of hotel nights</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={handleCalculate}
          disabled={calculateMutation.isPending}
          data-testid="button-calculate"
        >
          <Calculator className="w-4 h-4 mr-1.5" />
          {calculateMutation.isPending ? "Calculating..." : "Calculate Emissions"}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setInputs(defaultInputs);
            setResult(null);
          }}
          data-testid="button-reset"
        >
          Reset
        </Button>
      </div>

      {result && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                    return (
                      <div key={key} className="space-y-1" data-testid={`breakdown-${key}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm">{label}</span>
                          <span className="text-sm font-medium">{formatEmissions(val)}</span>
                        </div>
                        <div className="h-2 w-full bg-muted rounded-md overflow-hidden">
                          <div
                            className={`h-full rounded-md ${color}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-md border border-border">
            <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground" data-testid="text-disclaimer">
              These calculations are estimates based on standard emission factors and should be reviewed before use in formal disclosures.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowFactors(!showFactors)}
          data-testid="button-toggle-factors"
        >
          {showFactors ? <ChevronUp className="w-4 h-4 mr-1.5" /> : <ChevronDown className="w-4 h-4 mr-1.5" />}
          {showFactors ? "Hide" : "Show"} Emission Factors
        </Button>
        {showFactors && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Emission Factors</CardTitle>
              <CardDescription>Standard factors used in calculations</CardDescription>
            </CardHeader>
            <CardContent>
              {factorsLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-8" />
                  ))}
                </div>
              ) : factors && factors.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Factor (kgCO2e)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {factors.map((f) => (
                      <TableRow key={f.id} data-testid={`factor-row-${f.id}`}>
                        <TableCell className="text-sm">{f.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{f.category}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{f.unit}</TableCell>
                        <TableCell className="text-sm font-medium">{f.factor}</TableCell>
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
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
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
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((calc, idx) => (
                  <TableRow key={calc.id || idx} data-testid={`history-row-${calc.id || idx}`}>
                    <TableCell className="text-sm font-medium">{calc.reportingPeriod}</TableCell>
                    <TableCell className="text-sm">{formatEmissions(parseFloat(String(calc.scope1Total || "0")))}</TableCell>
                    <TableCell className="text-sm">{formatEmissions(parseFloat(String(calc.scope2Total || "0")))}</TableCell>
                    <TableCell className="text-sm">{formatEmissions(parseFloat(String(calc.scope3Total || "0")))}</TableCell>
                    <TableCell className="text-sm font-medium">{formatEmissions(parseFloat(String(calc.totalEmissions || "0")))}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {calc.createdAt ? new Date(calc.createdAt).toLocaleDateString() : "N/A"}
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
