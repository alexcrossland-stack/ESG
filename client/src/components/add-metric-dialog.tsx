import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { invalidateMetricDependentQueries } from "@/lib/metric-query-invalidation";
import { useToast } from "@/hooks/use-toast";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

type AddMetricFormValues = {
  name: string;
  description: string;
  category: "environmental" | "social" | "governance";
  unit: string;
  frequency: "monthly" | "quarterly" | "annual";
  dataOwner: string;
};

function trimmedMetricInput(data: AddMetricFormValues): AddMetricFormValues {
  return {
    ...data,
    name: data.name.trim(),
    description: data.description.trim(),
    unit: data.unit.trim(),
    dataOwner: data.dataOwner.trim(),
  };
}

export function AddMetricDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const form = useForm<AddMetricFormValues>({
    defaultValues: {
      name: "",
      description: "",
      category: "environmental",
      unit: "",
      frequency: "monthly",
      dataOwner: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: AddMetricFormValues) => apiRequest("POST", "/api/metrics", trimmedMetricInput(data)),
    onMutate: () => form.clearErrors("root.server"),
    onSuccess: () => {
      invalidateMetricDependentQueries(queryClient);
      toast({ title: "Metric added" });
      onClose();
    },
    onError: (error: Error) => {
      const message = error.message || "The metric could not be added. Check the details and try again.";
      form.setError("root.server", { type: "server", message });
      toast({ title: "Metric not added", description: message, variant: "destructive" });
    },
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add Custom Metric</DialogTitle>
        <DialogDescription>
          Define a metric your company can measure and track, including its unit, frequency and data owner.
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form noValidate onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4 pt-2">
          <FormField
            control={form.control}
            name="name"
            rules={{
              validate: (value) => value.trim().length > 0 || "Metric name is required",
              maxLength: { value: 160, message: "Metric name must be 160 characters or fewer" },
            }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Metric Name</FormLabel>
                <FormControl><Input maxLength={160} placeholder="e.g. Fleet Fuel Consumption" {...field} data-testid="input-metric-name" /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            rules={{ maxLength: { value: 2000, message: "Description must be 2,000 characters or fewer" } }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl><Textarea maxLength={2000} placeholder="What does this metric measure?" {...field} className="resize-none" data-testid="input-metric-desc" /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger data-testid="select-metric-category"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="environmental">Environmental</SelectItem>
                      <SelectItem value="social">Social</SelectItem>
                      <SelectItem value="governance">Governance</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="frequency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Frequency</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger data-testid="select-metric-freq"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="unit"
              rules={{ maxLength: { value: 64, message: "Unit must be 64 characters or fewer" } }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit</FormLabel>
                  <FormControl><Input maxLength={64} placeholder="kWh, %, tonnes..." {...field} data-testid="input-metric-unit" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dataOwner"
              rules={{ maxLength: { value: 160, message: "Data owner must be 160 characters or fewer" } }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data Owner</FormLabel>
                  <FormControl><Input maxLength={160} placeholder="HR Manager" {...field} data-testid="input-metric-owner" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          {form.formState.errors.root?.server?.message && (
            <p className="text-sm font-medium text-destructive" role="alert" data-testid="error-add-metric">
              {form.formState.errors.root.server.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending} data-testid="button-add-metric">
              {mutation.isPending ? "Adding..." : "Add Metric"}
            </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}
