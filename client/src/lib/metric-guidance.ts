export type MetricPriority = "essential" | "recommended" | "optional";
export type MetricGroup = "environmental" | "social" | "governance" | "advanced";

export interface MetricGuidance {
  meaning: string;
  why: string;
  howToCalculate: string;
  proofTypes: string[];
  exampleValue: string;
  prompt?: string;
  estimatePrompt?: string;
  owner?: string;
  frequency?: string;
}

export interface MetricConfig {
  priority: MetricPriority;
  group: MetricGroup;
  guidance: MetricGuidance;
}

const G: Record<string, MetricConfig> = {
  electricity_kwh: {
    priority: "essential",
    group: "environmental",
    guidance: {
      meaning: "Total electricity your organisation consumed from the grid during this period.",
      why: "Electricity is typically the largest source of Scope 2 carbon emissions for office-based businesses. Tracking it is mandatory for most ESG disclosures.",
      howToCalculate: "Add up the kWh figures from all electricity bills for the period. If your bill shows units in a different format, your supplier can provide kWh totals.",
      proofTypes: ["Electricity bills", "Utility account statements", "Smart meter export"],
      exampleValue: "12,500 kWh for a 20-person office over one month",
      prompt: "Upload a utility bill to support this value",
      estimatePrompt: "Estimate from last year's bill, or use 400–600 kWh per employee per month as a starting point.",
      owner: "Finance / Office Manager",
      frequency: "Monthly",
    },
  },
  gas_kwh: {
    priority: "essential",
    group: "environmental",
    guidance: {
      meaning: "Total natural gas or other fuel consumed for heating or hot water, measured in kWh.",
      why: "Gas combustion produces direct Scope 1 carbon emissions. It's typically your highest direct emission source.",
      howToCalculate: "Check your gas bills — they usually show kWh directly. If shown in cubic metres, multiply by 10.55 to convert.",
      proofTypes: ["Gas bills", "Utility account statements"],
      exampleValue: "3,200 kWh for a month of winter heating",
      prompt: "Upload your gas bill to support this value",
      estimatePrompt: "Use your previous year's bill as a guide, adjusting for any changes in office size or heating hours.",
      owner: "Finance / Facilities",
      frequency: "Monthly",
    },
  },
  vehicle_fuel_litres: {
    priority: "recommended",
    group: "environmental",
    guidance: {
      meaning: "Total fuel (petrol, diesel) purchased for company-owned or leased vehicles.",
      why: "Company vehicle fuel is a direct Scope 1 carbon emission. It's commonly required for GHG inventory reports.",
      howToCalculate: "Sum all fuel receipts or fuel card statements for company vehicles. Exclude employee personal vehicles claimed as mileage — those go in Business Car Miles instead.",
      proofTypes: ["Fuel card statements", "Petrol receipts", "Fleet management reports"],
      exampleValue: "320 litres of diesel across 3 company vans",
      prompt: "Use your fleet card or company fuel receipts",
      estimatePrompt: "If records are incomplete, estimate from typical mileage × average fuel efficiency.",
      owner: "Fleet Manager / Operations",
      frequency: "Monthly",
    },
  },
  total_waste_tonnes: {
    priority: "recommended",
    group: "environmental",
    guidance: {
      meaning: "Total waste your organisation generated during this period, in tonnes.",
      why: "Waste generation is a key environmental metric. Customers and investors increasingly want to see waste reduction trends.",
      howToCalculate: "Get this from your waste contractor's collection reports. Many will provide this monthly in kg — divide by 1,000 to convert to tonnes.",
      proofTypes: ["Waste contractor reports", "Collection manifests", "Weighbridge receipts"],
      exampleValue: "0.8 tonnes for a 30-person office over one month",
      prompt: "Your waste contractor can provide monthly reports",
      estimatePrompt: "Use an estimate of 10–15 kg per employee per month as a starting point.",
      owner: "Facilities / Operations",
      frequency: "Monthly",
    },
  },
  recycled_waste_tonnes: {
    priority: "recommended",
    group: "environmental",
    guidance: {
      meaning: "The portion of total waste that was sent for recycling rather than landfill or incineration.",
      why: "Recycling rate (recycled ÷ total waste) is commonly reported in ESG frameworks. A higher rate signals strong waste management.",
      howToCalculate: "From your waste contractor report, find the weight sent to recycling streams. This includes paper, cardboard, plastics, metals, and WEEE.",
      proofTypes: ["Waste contractor recycling reports", "Collection manifests"],
      exampleValue: "0.5 tonnes recycled out of 0.8 tonnes total",
      prompt: "Enter this alongside Total Waste to get your Recycling Rate calculated automatically",
      estimatePrompt: "If you have segregated bins, estimate the proportion recycled vs general waste.",
      owner: "Facilities / Operations",
      frequency: "Monthly",
    },
  },
  water_m3: {
    priority: "recommended",
    group: "environmental",
    guidance: {
      meaning: "Total water consumed from mains supply, in cubic metres (m³).",
      why: "Water is a shared resource under increasing stress. Many investors and supply chain partners require water use disclosure.",
      howToCalculate: "Read from your water bill or meter. Bills usually show m³ directly. If shared with other tenants, you may need to apportion based on floor area.",
      proofTypes: ["Water bills", "Meter readings"],
      exampleValue: "18 m³ for a 20-person office over one month",
      prompt: "Your water bill shows this in cubic metres",
      estimatePrompt: "Use 2–4 litres per employee per day as an estimate (divide by 1,000 for m³).",
      owner: "Facilities / Finance",
      frequency: "Monthly",
    },
  },
  domestic_flight_km: {
    priority: "optional",
    group: "environmental",
    guidance: {
      meaning: "Total distance flown on domestic flights for business purposes, in kilometres.",
      why: "Air travel is one of the highest per-trip emission sources. GHG frameworks require separating domestic, short-haul, and long-haul distances.",
      howToCalculate: "Sum the flight distances for all business flights. Most booking tools and travel agents can export this. If not, use a flight distance calculator (e.g., Great Circle Mapper).",
      proofTypes: ["Travel booking records", "Expense claims", "Corporate card statements"],
      exampleValue: "1,200 km (e.g., 3 London–Edinburgh round trips)",
      prompt: "This is typically managed by Finance or your travel booker",
      estimatePrompt: "Count flights taken and multiply by typical route distance.",
      owner: "Finance / PA",
      frequency: "Monthly or quarterly",
    },
  },
  short_haul_flight_km: {
    priority: "optional",
    group: "environmental",
    guidance: {
      meaning: "Total distance flown on short-haul flights (under 3,700 km) for business purposes.",
      why: "Short-haul flights have a higher per-km carbon footprint than long-haul due to the fuel burn at take-off and landing. Separating them gives a more accurate picture.",
      howToCalculate: "Sum distance for European and similar routes. Your travel booking records should include this. Short-haul is generally under 3,700 km one way.",
      proofTypes: ["Travel booking reports", "Expense claims"],
      exampleValue: "4,500 km (e.g., 3 London–Amsterdam return trips)",
      prompt: "Use your corporate travel booking tool or expense system",
      estimatePrompt: "Estimate from number of trips × typical route distance.",
      owner: "Finance / PA",
      frequency: "Monthly or quarterly",
    },
  },
  long_haul_flight_km: {
    priority: "optional",
    group: "environmental",
    guidance: {
      meaning: "Total distance flown on long-haul flights (over 3,700 km) for business purposes.",
      why: "Long-haul travel contributes significantly to Scope 3 business travel emissions and is increasingly scrutinised by ESG frameworks.",
      howToCalculate: "Sum distances for intercontinental and long-distance routes. Your travel booking records are the best source.",
      proofTypes: ["Travel booking reports", "Expense claims"],
      exampleValue: "18,000 km (e.g., 2 London–New York return trips)",
      prompt: "Use your corporate travel booking tool or expense system",
      owner: "Finance / PA",
      frequency: "Quarterly",
    },
  },
  rail_km: {
    priority: "optional",
    group: "environmental",
    guidance: {
      meaning: "Total distance travelled by rail for business purposes, in kilometres.",
      why: "Rail travel has a much lower carbon footprint than air or car. Tracking it helps show modal shift improvements over time.",
      howToCalculate: "Sum rail journey distances from travel records or expense claims. Most rail booking systems can export journey distances.",
      proofTypes: ["Rail booking records", "Expense claims"],
      exampleValue: "2,000 km in a quarter",
      prompt: "This is often lower-priority than flight data — start with flights first",
      estimatePrompt: "Estimate from number of journeys × average journey length.",
      owner: "Finance / PA",
      frequency: "Quarterly",
    },
  },
  hotel_nights: {
    priority: "optional",
    group: "environmental",
    guidance: {
      meaning: "Total number of hotel nights booked for business travel.",
      why: "Hotel accommodation contributes to Scope 3 emissions. It's required in some GHG inventories and ESG supply chain assessments.",
      howToCalculate: "Count hotel nights from expense claims or booking records. One night = one person in one room for one night.",
      proofTypes: ["Hotel booking records", "Expense claims", "Corporate card statements"],
      exampleValue: "15 hotel nights in a quarter",
      estimatePrompt: "Count nights from expense claims if booking records aren't available.",
      owner: "Finance / PA",
      frequency: "Quarterly",
    },
  },
  car_miles: {
    priority: "recommended",
    group: "environmental",
    guidance: {
      meaning: "Total miles driven in personal vehicles for business purposes and claimed as mileage expenses.",
      why: "Employee mileage (Scope 3) is often a significant source of business travel emissions for field-based teams and sales teams.",
      howToCalculate: "Sum the miles from all approved mileage expense claims. Your expense system should have a report for this.",
      proofTypes: ["Mileage expense claims", "Expense management system exports"],
      exampleValue: "3,500 miles claimed in a quarter",
      prompt: "Pull this from your expense management system",
      estimatePrompt: "Use typical journeys × estimated mileage if exact records aren't available.",
      owner: "Finance",
      frequency: "Monthly",
    },
  },
  employee_headcount: {
    priority: "essential",
    group: "social",
    guidance: {
      meaning: "Total number of employees on your payroll at the end of this period, including part-time staff.",
      why: "Headcount is used to calculate per-employee intensity metrics (carbon per employee, training hours per employee) and is a foundation for social reporting.",
      howToCalculate: "Count all employees on payroll at the last day of the period. This includes part-time and fixed-term contracts. Typically available from your HR or payroll system.",
      proofTypes: ["Payroll records", "HR system export"],
      exampleValue: "47 employees at month-end",
      prompt: "This is usually owned by HR or Payroll",
      owner: "HR / Payroll",
      frequency: "Monthly",
    },
  },
  employee_leavers: {
    priority: "recommended",
    group: "social",
    guidance: {
      meaning: "Number of employees who left your organisation during this period (voluntary and involuntary).",
      why: "Employee turnover rate is a key Social metric. High turnover signals culture or wellbeing issues and has real cost implications.",
      howToCalculate: "Count all leavers in the period regardless of reason (resignation, redundancy, retirement, dismissal). Available from your HR system.",
      proofTypes: ["HR system leaver records", "Payroll change reports"],
      exampleValue: "3 leavers in a month from a team of 47",
      prompt: "This is typically owned by HR",
      estimatePrompt: "If HR records aren't available, estimate from managers' knowledge of departures.",
      owner: "HR",
      frequency: "Monthly",
    },
  },
  absence_days: {
    priority: "recommended",
    group: "social",
    guidance: {
      meaning: "Total number of working days lost to sickness absence across all employees in this period.",
      why: "Absence rate is a proxy for employee wellbeing and workforce health. It's increasingly included in Social metrics for ESG reporting.",
      howToCalculate: "Sum all sick days recorded in your HR or absence management system. Include all employees. Part-days count as 0.5.",
      proofTypes: ["HR absence records", "Line manager absence reports"],
      exampleValue: "28 absence days across all staff in a month",
      prompt: "HR or line managers typically track this",
      estimatePrompt: "If formal tracking isn't in place, ask managers to estimate from memory for recent periods.",
      owner: "HR",
      frequency: "Monthly",
    },
  },
  total_working_days: {
    priority: "recommended",
    group: "social",
    guidance: {
      meaning: "Total available working days across all employees in this period (before absences).",
      why: "This is the denominator for calculating Absence Rate. Without it, the absence figure can't be put in context.",
      howToCalculate: "Multiply your headcount by the number of working days in the period (usually 20–23). Exclude weekends and public holidays.",
      proofTypes: ["Payroll records", "HR system"],
      exampleValue: "47 employees × 20 working days = 940 total working days",
      prompt: "Usually straightforward: headcount × working days in the month",
      owner: "HR / Finance",
      frequency: "Monthly",
    },
  },
  total_training_hours: {
    priority: "recommended",
    group: "social",
    guidance: {
      meaning: "Total hours of formal training delivered to employees in this period.",
      why: "Training investment per employee is a Social metric that signals commitment to workforce development. Required by many ESG frameworks.",
      howToCalculate: "Sum all formal training hours from your LMS or training records. Include internal and external training. Exclude informal on-the-job learning.",
      proofTypes: ["LMS training records", "Training completion reports", "Expense claims for external training"],
      exampleValue: "85 training hours across 47 staff in a quarter",
      prompt: "Your LMS or HR system should have a training completion report",
      estimatePrompt: "Ask managers to estimate formal training hours per team if records aren't centralised.",
      owner: "HR / L&D",
      frequency: "Quarterly",
    },
  },
  female_managers: {
    priority: "recommended",
    group: "social",
    guidance: {
      meaning: "Number of managers who identify as female.",
      why: "Management gender diversity is a key Social metric. Boards, investors and customers increasingly look for gender balance in leadership.",
      howToCalculate: "Count all employees in a management role (team lead and above) who identify as female. Use your HR records.",
      proofTypes: ["HR system records", "Org chart data"],
      exampleValue: "5 female managers out of 12 total",
      prompt: "HR typically holds this data",
      owner: "HR",
      frequency: "Quarterly",
    },
  },
  total_managers: {
    priority: "recommended",
    group: "social",
    guidance: {
      meaning: "Total number of employees in a management role (team lead and above).",
      why: "Needed to calculate Management Gender Diversity ratio. Also useful for leadership span-of-control benchmarking.",
      howToCalculate: "Count all employees with a management title or responsibility for direct reports, from team lead upwards.",
      proofTypes: ["HR system records", "Org chart"],
      exampleValue: "12 managers in a team of 47",
      owner: "HR",
      frequency: "Quarterly",
    },
  },
  living_wage_employees: {
    priority: "recommended",
    group: "social",
    guidance: {
      meaning: "Number of employees paid at or above the Real Living Wage (as set by the Living Wage Foundation).",
      why: "Living Wage Coverage is a core Social metric showing fair pay. Many procurement frameworks and investors require this disclosure.",
      howToCalculate: "Compare each employee's hourly rate against the current Real Living Wage rate. Count those at or above it. The Living Wage Foundation publishes rates annually.",
      proofTypes: ["Payroll records", "Living Wage Foundation certification"],
      exampleValue: "44 out of 47 employees paid at or above the Living Wage",
      prompt: "Your payroll team can produce this from payroll records",
      estimatePrompt: "If payroll data isn't easily accessible, ask your Finance team for the proportion on minimum wage vs Living Wage contracts.",
      owner: "HR / Finance",
      frequency: "Annually (or on policy change)",
    },
  },
  trained_staff: {
    priority: "recommended",
    group: "governance",
    guidance: {
      meaning: "Number of employees who have completed data privacy (GDPR) training.",
      why: "Data privacy training completion is a Governance metric. Regulators and customers want evidence that staff understand their obligations under GDPR.",
      howToCalculate: "Count employees who have completed your GDPR or data protection training module in the period. Use your LMS or training records.",
      proofTypes: ["LMS completion records", "Training certificates", "E-learning platform reports"],
      exampleValue: "43 out of 47 staff trained",
      prompt: "Your LMS or compliance platform should have completion data",
      owner: "Compliance / HR",
      frequency: "Annually",
    },
  },
  total_staff: {
    priority: "essential",
    group: "governance",
    guidance: {
      meaning: "Total staff count used as the denominator for training completion percentage calculations.",
      why: "Needed to calculate Data Privacy Training Completion %. Usually the same as Employee Headcount.",
      howToCalculate: "Use the same figure as Employee Headcount for consistency. If you use different employee populations for training (e.g., excluding contractors), note that.",
      proofTypes: ["Payroll records", "HR system"],
      exampleValue: "47 staff",
      prompt: "Usually the same as Employee Headcount — enter consistently",
      owner: "HR",
      frequency: "Monthly",
    },
  },
  signed_suppliers: {
    priority: "recommended",
    group: "governance",
    guidance: {
      meaning: "Number of suppliers who have signed your Supplier Code of Conduct.",
      why: "Supply chain governance is increasingly required by ESG frameworks. A Code of Conduct ensures your standards extend to your supply chain.",
      howToCalculate: "Count suppliers who have returned a signed copy of your Code of Conduct. Your procurement team should track this.",
      proofTypes: ["Signed agreement records", "Supplier portal records"],
      exampleValue: "18 out of 25 suppliers signed",
      prompt: "Your procurement or legal team typically tracks this",
      estimatePrompt: "If you don't yet have a Code of Conduct, record 0 — your Policy module can help you create one.",
      owner: "Procurement / Legal",
      frequency: "Quarterly",
    },
  },
  total_suppliers: {
    priority: "recommended",
    group: "governance",
    guidance: {
      meaning: "Total number of active suppliers your organisation has during this period.",
      why: "Required to calculate Supplier Code of Conduct Adoption rate. Also used for supply chain risk assessments.",
      howToCalculate: "Count unique suppliers that invoiced your company during the period. Your finance or procurement system should have this.",
      proofTypes: ["Finance system supplier list", "Accounts payable records"],
      exampleValue: "25 active suppliers",
      owner: "Procurement / Finance",
      frequency: "Quarterly",
    },
  },
  annual_revenue: {
    priority: "essential",
    group: "governance",
    guidance: {
      meaning: "Your organisation's total revenue for the year, in GBP.",
      why: "Revenue is used to calculate Carbon Intensity (tonnes CO₂e per £1M revenue), a key metric for comparing businesses of different sizes.",
      howToCalculate: "Use the figure from your management accounts or annual accounts. For periods less than 12 months, use annualised revenue.",
      proofTypes: ["Management accounts", "Annual report"],
      exampleValue: "£2.4 million annual revenue",
      prompt: "Available from your Finance team or management accounts",
      owner: "Finance",
      frequency: "Annually (or use rolling 12-month figure)",
    },
  },
};

const MANUAL_METRIC_CONFIGS: Record<string, Partial<MetricConfig>> = {
  "Scope 1 Emissions": { priority: "essential", group: "environmental" },
  "Scope 2 Emissions": { priority: "essential", group: "environmental" },
  "Recycling Rate": { priority: "recommended", group: "environmental" },
  "Business Travel Emissions": { priority: "recommended", group: "environmental" },
  "Carbon Intensity": { priority: "recommended", group: "environmental" },
  "Employee Turnover Rate": { priority: "essential", group: "social" },
  "Absence Rate": { priority: "recommended", group: "social" },
  "Training Hours per Employee": { priority: "recommended", group: "social" },
  "Management Gender Diversity": { priority: "recommended", group: "social" },
  "Living Wage Coverage": { priority: "recommended", group: "social" },
  "Data Privacy Training Completion": { priority: "recommended", group: "governance" },
  "Supplier Code of Conduct Adoption": { priority: "recommended", group: "governance" },
};

const ESSENTIAL_METRICS_KEYS = new Set(
  Object.entries(G).filter(([, v]) => v.priority === "essential").map(([k]) => k)
);

export function getMetricGuidance(key: string): MetricConfig | undefined {
  return G[key];
}

export function getManualMetricPriority(metricName: string): MetricPriority {
  const config = MANUAL_METRIC_CONFIGS[metricName];
  return config?.priority ?? "optional";
}

export function getManualMetricGroup(metricName: string): MetricGroup {
  const config = MANUAL_METRIC_CONFIGS[metricName];
  return config?.group ?? "environmental";
}

export function getRawFieldGuidance(key: string): MetricGuidance | undefined {
  return G[key]?.guidance;
}

export function getRawFieldPriority(key: string): MetricPriority {
  return G[key]?.priority ?? "optional";
}

export const PRIORITY_LABELS: Record<MetricPriority, { label: string; color: string; description: string }> = {
  essential: {
    label: "Essential",
    color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    description: "Enter this first — it drives key calculated metrics",
  },
  recommended: {
    label: "Recommended",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    description: "Recommended for a complete baseline report",
  },
  optional: {
    label: "Optional",
    color: "bg-muted text-muted-foreground",
    description: "Enter later to improve completeness",
  },
};

export const CONTEXTUAL_PROMPTS: Record<string, string[]> = {
  electricity_kwh: [
    "Upload a utility bill to support this value",
    "Typically entered monthly from your electricity bill",
  ],
  gas_kwh: [
    "Upload a gas bill to support this value",
    "Typically entered monthly from your gas bill",
  ],
  employee_headcount: [
    "This metric is typically owned by HR or Payroll",
    "Enter headcount at the last day of the period",
  ],
  vehicle_fuel_litres: [
    "Use your fleet card statement for accuracy",
    "Exclude employee mileage claims — those go in Business Car Miles",
  ],
  total_waste_tonnes: [
    "Your waste contractor can provide monthly reports",
    "You can start with an estimate and improve this later",
  ],
  car_miles: [
    "Pull this from your expense management system",
    "This metric is typically owned by Finance",
  ],
  annual_revenue: [
    "This metric is typically owned by Finance",
    "Used to calculate carbon intensity — enter once per year",
  ],
  total_training_hours: [
    "This metric is typically owned by HR or L&D",
    "This metric is typically entered quarterly",
  ],
  female_managers: [
    "This metric is typically owned by HR",
    "This metric is typically entered quarterly",
  ],
};
