import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, setAuthToken } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Leaf } from "lucide-react";
import { LEGAL_VERSION } from "@/lib/legal-content";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const registerSchema = z.object({
  username: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  companyName: z.string().min(2, "Company name must be at least 2 characters"),
  termsAccepted: z.boolean().refine(v => v === true, { message: "You must accept the Terms of Service to continue" }),
  privacyAccepted: z.boolean().refine(v => v === true, { message: "You must accept the Privacy Policy to continue" }),
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
    defaultValues: {
      username: "",
      email: "",
      password: "",
      companyName: "",
      termsAccepted: false,
      privacyAccepted: false,
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: z.infer<typeof loginSchema>) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      return res.json();
    },
    onSuccess: async (data) => {
      if (data.token) setAuthToken(data.token);
      queryClient.setQueryData(["/api/auth/me"], { user: data.user, company: data.company });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"], refetchType: "none" });
      setLocation("/");
    },
    onError: (e: any) => {
      toast({ title: "Login failed", description: e.message || "Invalid credentials", variant: "destructive" });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: z.infer<typeof registerSchema>) => {
      const res = await apiRequest("POST", "/api/auth/register", {
        username: data.username,
        email: data.email,
        password: data.password,
        companyName: data.companyName,
        termsAccepted: data.termsAccepted,
        privacyAccepted: data.privacyAccepted,
        termsVersion: LEGAL_VERSION,
        privacyVersion: LEGAL_VERSION,
      });
      return res.json();
    },
    onSuccess: async (data) => {
      if (data.token) setAuthToken(data.token);
      queryClient.setQueryData(["/api/auth/me"], { user: data.user, company: data.company });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"], refetchType: "none" });
      setLocation("/");
      toast({ title: "Welcome!", description: "Your ESG platform is ready." });
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
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Leaf className="w-6 h-6 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">ESG Manager</h1>
          <p className="text-muted-foreground text-sm">Sustainability management for growing businesses</p>
        </div>

        <Card>
          <Tabs defaultValue="login">
            <CardHeader>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login" data-testid="tab-login">Sign In</TabsTrigger>
                <TabsTrigger value="register" data-testid="tab-register">Create Account</TabsTrigger>
              </TabsList>
            </CardHeader>

            <TabsContent value="login">
              <CardContent className="pt-2">
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

                <div className="mt-4 pt-4 border-t">
                  <CardDescription className="text-center mb-3 text-xs">Try before you commit</CardDescription>
                  <Button
                    variant="outline"
                    className="w-full"
                    data-testid="button-demo"
                    disabled={loginMutation.isPending}
                    onClick={() => {
                      loginMutation.mutate({ email: "demo@example.com", password: "password123" });
                    }}
                  >
                    {loginMutation.isPending ? "Signing in..." : "Try Demo Account"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Pre-loaded with sample ESG data so you can explore every feature
                  </p>
                </div>
              </CardContent>
            </TabsContent>

            <TabsContent value="register">
              <CardContent className="pt-2">
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

                    <div className="space-y-3 pt-2 border-t">
                      <FormField control={registerForm.control} name="termsAccepted" render={({ field }) => (
                        <FormItem className="flex items-start gap-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-terms"
                              id="checkbox-terms"
                            />
                          </FormControl>
                          <div className="space-y-0.5">
                            <label htmlFor="checkbox-terms" className="text-sm leading-snug cursor-pointer">
                              I have read and agree to the{" "}
                              <Link href="/terms">
                                <a className="text-primary underline hover:no-underline" target="_blank">Terms of Service</a>
                              </Link>
                            </label>
                            <FormMessage />
                          </div>
                        </FormItem>
                      )} />

                      <FormField control={registerForm.control} name="privacyAccepted" render={({ field }) => (
                        <FormItem className="flex items-start gap-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-privacy"
                              id="checkbox-privacy"
                            />
                          </FormControl>
                          <div className="space-y-0.5">
                            <label htmlFor="checkbox-privacy" className="text-sm leading-snug cursor-pointer">
                              I have read and agree to the{" "}
                              <Link href="/privacy">
                                <a className="text-primary underline hover:no-underline" target="_blank">Privacy Policy</a>
                              </Link>
                            </label>
                            <FormMessage />
                          </div>
                        </FormItem>
                      )} />
                    </div>

                    <Button type="submit" className="w-full" disabled={registerMutation.isPending} data-testid="button-register">
                      {registerMutation.isPending ? "Setting up..." : "Create Account"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </TabsContent>
          </Tabs>
        </Card>

        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Link href="/terms"><a className="hover:underline">Terms</a></Link>
          <Link href="/privacy"><a className="hover:underline">Privacy</a></Link>
          <Link href="/cookies"><a className="hover:underline">Cookies</a></Link>
          <Link href="/dpa"><a className="hover:underline">DPA</a></Link>
        </nav>
      </div>
    </div>
  );
}
