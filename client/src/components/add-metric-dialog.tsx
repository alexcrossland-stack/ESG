import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

export function AddMetricDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const form = useForm({
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
    mutationFn: (data: any) => apiRequest("POST", "/api/metrics", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/enhanced"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metric-definitions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/data-entry"] });
      toast({ title: "Metric added" });
      onClose();
    },
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add Custom Metric</DialogTitle>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4 pt-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Metric Name</FormLabel>
                <FormControl><Input placeholder="e.g. Fleet Fuel Consumption" {...field} data-testid="input-metric-name" /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl><Textarea placeholder="What does this metric measure?" {...field} className="resize-none" data-testid="input-metric-desc" /></FormControl>
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
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit</FormLabel>
                  <FormControl><Input placeholder="kWh, %, tonnes..." {...field} data-testid="input-metric-unit" /></FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dataOwner"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data Owner</FormLabel>
                  <FormControl><Input placeholder="HR Manager" {...field} data-testid="input-metric-owner" /></FormControl>
                </FormItem>
              )}
            />
          </div>
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
