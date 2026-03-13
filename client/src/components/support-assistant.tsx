import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircle, X, Send, ChevronDown, Bot, User,
  Minimize2, Sparkles,
} from "lucide-react";

const PAGE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/metrics": "Metrics Library",
  "/data-entry": "Data Entry",
  "/policy": "ESG Policy",
  "/policy-templates": "Policy Templates",
  "/policy-generator": "Policy Generator",
  "/evidence": "Evidence",
  "/topics": "Priority Topics",
  "/reports": "Reports",
  "/compliance": "Compliance",
  "/onboarding": "Setup Wizard",
  "/settings": "Settings",
};

const SUGGESTED_QUESTIONS = [
  "How do I calculate my carbon footprint?",
  "What ESG policies should I create first?",
  "What is Scope 1, 2, and 3 emissions?",
  "How often should I enter data?",
  "What evidence should I collect?",
];

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
};

export function SupportAssistant() {
  const [open, setOpen] = useState(false);
  const [minimised, setMinimised] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [location] = useLocation();

  const { data: authData } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const { data: statusData } = useQuery<any>({ queryKey: ["/api/programme/status"] });

  const pageLabel = PAGE_LABELS[location] || "Platform";

  useEffect(() => {
    if (open && !minimised) {
      setUnreadCount(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, minimised]);

  useEffect(() => {
    if (open && !minimised) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open, minimised]);

  function addMessage(role: "user" | "assistant", text: string) {
    const msg: Message = { id: Math.random().toString(36).slice(2), role, text, timestamp: new Date() };
    setMessages(prev => [...prev, msg]);
    if (!open || minimised) {
      setUnreadCount(prev => prev + 1);
    }
  }

  async function sendMessage(text?: string) {
    const messageText = (text || input).trim();
    if (!messageText) return;

    setInput("");
    addMessage("user", messageText);
    setLoading(true);

    try {
      const res = await apiRequest("POST", "/api/chat/assist", {
        message: messageText,
        pageContext: pageLabel,
        companyContext: {
          maturityLevel: authData?.company?.esgMaturity || null,
          policiesAdopted: statusData?.policiesAdoptedCount ?? null,
          metricsWithData: statusData?.metricsWithDataCount ?? null,
          evidenceCount: statusData?.evidenceCount ?? null,
        },
      });
      const data = await res.json();
      addMessage("assistant", data.reply || "I'm unable to answer right now.");
    } catch {
      addMessage("assistant", "Sorry, I'm having trouble connecting. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function openFresh() {
    setOpen(true);
    setMinimised(false);
    if (messages.length === 0) {
      setTimeout(() => {
        addMessage("assistant", `Hi! I'm your ESG assistant. I can help you understand ESG topics, guide you through the platform, and answer questions about sustainability practices for SMEs.\n\nWhat would you like to know?`);
      }, 400);
    }
  }

  return (
    <>
      {open && !minimised && (
        <div
          className="fixed bottom-20 right-4 sm:right-6 w-[calc(100vw-32px)] max-w-sm z-50 flex flex-col rounded-2xl border border-border bg-background shadow-2xl overflow-hidden"
          style={{ maxHeight: "70vh", minHeight: "400px" }}
          data-testid="support-assistant-panel"
        >
          <div className="flex items-center gap-2 p-3 border-b border-border bg-primary text-primary-foreground shrink-0">
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-none">ESG Assistant</p>
              <p className="text-xs opacity-75 mt-0.5 truncate">Ask me about ESG and sustainability</p>
            </div>
            <button
              onClick={() => setMinimised(true)}
              className="p-1 rounded hover:bg-white/20 transition-colors"
              data-testid="button-minimise-assistant"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:bg-white/20 transition-colors"
              data-testid="button-close-assistant"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                data-testid={`message-${msg.role}-${msg.id}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={`rounded-2xl px-3 py-2 text-sm max-w-[85%] whitespace-pre-line leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                >
                  {msg.text}
                </div>
                {msg.role === "user" && (
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2 justify-start" data-testid="assistant-loading">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2">
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            {messages.length <= 1 && !loading && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center py-1">Try asking</p>
                {SUGGESTED_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(q)}
                    className="w-full text-left text-xs p-2 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors"
                    data-testid={`suggested-question-${i}`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <div className="border-t border-border p-3 shrink-0">
            <div className="flex gap-2 items-center">
              <Input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question..."
                className="h-9 text-sm"
                disabled={loading}
                data-testid="input-assistant-message"
              />
              <Button
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                data-testid="button-send-message"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 text-center">AI-generated answers. Always verify critical decisions.</p>
          </div>
        </div>
      )}

      {open && minimised && (
        <button
          onClick={() => setMinimised(false)}
          className="fixed bottom-20 right-4 sm:right-6 z-50 flex items-center gap-2 bg-primary text-primary-foreground rounded-full px-4 py-2.5 shadow-lg hover:shadow-xl transition-all"
          data-testid="button-restore-assistant"
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-sm font-medium">ESG Assistant</span>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      )}

      {!open && (
        <button
          onClick={openFresh}
          className="fixed bottom-4 right-4 sm:right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
          data-testid="button-open-assistant"
        >
          <MessageCircle className="w-6 h-6" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      )}
    </>
  );
}
