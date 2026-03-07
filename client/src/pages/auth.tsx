import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Leaf } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const registerSchema = z.object({
  username: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  companyName: z.string().min(2, "Company name must be at least 2 characters"),
});

export default function Auth() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: "", email: "", password: "", companyName: "" },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: z.infer<typeof loginSchema>) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      return res.json();
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(["/api/auth/me"], data);
      setLocation("/");
    },
    onError: (e: any) => {
      toast({ title: "Login failed", description: e.message || "Invalid credentials", variant: "destructive" });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: z.infer<typeof registerSchema>) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      return res.json();
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(["/api/auth/me"], data);
      setLocation("/");
      toast({ title: "Welcome!", description: "Your ESG platform is ready. We've pre-loaded some example data to get you started." });
    },
    onError: (e: any) => {
      toast({ title: "Registration failed", description: e.message || "Something went wrong", variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary shadow-lg">
              <Leaf className="w-6 h-6 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">ESG Manager</h1>
          <p className="text-sm text-muted-foreground">
            Simple ESG management for growing businesses
          </p>
        </div>

        <Card>
          <Tabs defaultValue="login">
            <CardHeader className="pb-0">
              <TabsList className="w-full">
                <TabsTrigger value="login" className="flex-1" data-testid="tab-login">Sign In</TabsTrigger>
                <TabsTrigger value="register" className="flex-1" data-testid="tab-register">Get Started</TabsTrigger>
              </TabsList>
            </CardHeader>

            <TabsContent value="login">
              <CardContent className="pt-6">
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(d => loginMutation.mutate(d))} className="space-y-4">
                    <FormField control={loginForm.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="you@company.com" {...field} data-testid="input-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={loginForm.control} name="password" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" {...field} data-testid="input-password" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <Button type="submit" className="w-full" disabled={loginMutation.isPending} data-testid="button-login">
                      {loginMutation.isPending ? "Signing in..." : "Sign In"}
                    </Button>
                  </form>
                </Form>
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={loginMutation.isPending}
                  data-testid="button-demo-login"
                  onClick={() => {
                    loginForm.setValue("email", "demo@example.com");
                    loginForm.setValue("password", "password123");
                    loginMutation.mutate({ email: "demo@example.com", password: "password123" });
                  }}
                >
                  {loginMutation.isPending ? "Signing in..." : "Try Demo Account"}
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Pre-loaded with sample ESG data so you can explore every feature
                </p>
              </CardContent>
            </TabsContent>

            <TabsContent value="register">
              <CardContent className="pt-6">
                <Form {...registerForm}>
                  <form onSubmit={registerForm.handleSubmit(d => registerMutation.mutate(d))} className="space-y-4">
                    <FormField control={registerForm.control} name="companyName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Acme Ltd" {...field} data-testid="input-company" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={registerForm.control} name="username" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Your Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Jane Smith" {...field} data-testid="input-username" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={registerForm.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="jane@company.com" {...field} data-testid="input-register-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={registerForm.control} name="password" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" {...field} data-testid="input-register-password" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <Button type="submit" className="w-full" disabled={registerMutation.isPending} data-testid="button-register">
                      {registerMutation.isPending ? "Setting up..." : "Create Account"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </TabsContent>
          </Tabs>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          By using ESG Manager you agree to our terms of service
        </p>
      </div>
    </div>
  );
}
