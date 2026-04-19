import { useState, useRef, useEffect } from "react";
import { BotMessageSquare, X, Send, ChevronDown, Bot, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";

type Msg = { role: "user" | "assistant"; content: string };

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8002";

function getBackendCandidates(baseUrl: string): string[] {
  const normalized = baseUrl.replace(/\/+$/, "");
  const variants = new Set<string>([normalized]);
  variants.add(normalized.replace("127.0.0.1", "localhost"));
  variants.add(normalized.replace("localhost", "127.0.0.1"));
  variants.add(normalized.replace(":8000", ":8002"));
  variants.add(normalized.replace(":8002", ":8000"));
  return Array.from(variants);
}

export default function LiveChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi there! 👋 I'm Echo, your WrapUp assistant. How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showScroll, setShowScroll] = useState(false);
  const [showTooltip, setShowTooltip] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  // Auto-hide tooltip after 6 seconds
  useEffect(() => {
    const t = setTimeout(() => setShowTooltip(false), 6000);
    return () => clearTimeout(t);
  }, []);

  // Scroll-down button visibility
  useEffect(() => {
    const onScroll = () => setShowScroll(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const scrollToBottom = () => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg: Msg = { role: "user", content: text };
    const allMsgs = [...messages, userMsg];
    setMessages(allMsgs);
    setInput("");
    setLoading(true);

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && prev.length === allMsgs.length + 1) {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      let lastError = "Sorry, I couldn't connect. Please try again later.";
      let answered = false;
      for (const candidate of getBackendCandidates(BACKEND_URL)) {
        try {
          const resp = await fetch(`${candidate}/chat/live`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ messages: allMsgs }),
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            lastError = err.detail || err.error || `Chat service returned ${resp.status}`;
            continue;
          }
          const payload = await resp.json().catch(() => ({}));
          const answer = typeof payload.answer === "string" ? payload.answer.trim() : "";
          if (answer) {
            upsert(answer);
            answered = true;
            break;
          }
          lastError = "Chat service returned an empty response.";
        } catch {
          lastError = `Could not reach chat backend at ${candidate}`;
        }
      }
      if (!answered) upsert(lastError);
    } catch {
      upsert("Sorry, I couldn't connect. Please try again later.");
    }
    setLoading(false);
  };

  return (
    <>
      {/* Scroll-down FAB */}
      <AnimatePresence>
        {showScroll && !open && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={scrollToBottom}
            className="fixed bottom-24 right-6 z-50 w-10 h-10 rounded-full bg-muted/80 backdrop-blur-sm border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shadow-lg"
            aria-label="Scroll to bottom"
          >
            <ChevronDown className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Tooltip pop-up */}
      <AnimatePresence>
        {showTooltip && !open && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="fixed bottom-8 right-[5.5rem] z-50 bg-card border border-border/50 rounded-xl px-4 py-2.5 shadow-xl max-w-[200px]"
          >
            <button onClick={() => setShowTooltip(false)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-muted border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground text-xs">✕</button>
            <p className="text-sm font-medium text-foreground">👋 Hi! I'm Echo</p>
            <p className="text-xs text-muted-foreground mt-0.5">Ask me anything about WrapUp</p>
            <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 rotate-45 bg-card border-r border-b border-border/50" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat FAB */}
      <motion.button
        onClick={() => { setOpen(!open); setShowTooltip(false); }}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#0D1B3E] flex items-center justify-center hover:scale-105 transition-transform overflow-hidden"
        whileTap={{ scale: 0.95 }}
        animate={{
          boxShadow: [
            "0 0 20px 2px rgba(56, 236, 255, 0.45), 0 0 40px 4px rgba(26, 82, 232, 0.3)",
            "0 0 36px 10px rgba(56, 236, 255, 0.65), 0 0 72px 16px rgba(26, 82, 232, 0.45)",
            "0 0 20px 2px rgba(56, 236, 255, 0.45), 0 0 40px 4px rgba(26, 82, 232, 0.3)",
          ],
        }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        aria-label={open ? "Close chat" : "Open chat"}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.span
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="text-white"
            >
              <X className="w-6 h-6" />
            </motion.span>
          ) : (
            <motion.img
              key="open"
              src="/echo.svg"
              alt="Echo"
              className="w-14 h-14"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.15 }}
            />
          )}
        </AnimatePresence>
      </motion.button>

      {/* Chat Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="fixed bottom-24 right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[500px] max-h-[calc(100vh-8rem)] rounded-2xl border border-border/50 bg-card/95 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-border/30 bg-emerald-500/5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <Bot className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Echo</p>
                <p className="text-[11px] text-muted-foreground">Your WrapUp Assistant</p>
              </div>
              <div className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            {/* Messages */}
            <div ref={chatRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  {m.role === "assistant" && (
                    <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-gradient-to-br from-emerald-400 to-cyan-500 text-white rounded-br-sm"
                        : "bg-muted/60 text-foreground rounded-bl-sm"
                    }`}
                  >
                    {m.role === "assistant" ? (
                      <div className="prose prose-sm prose-invert max-w-none [&>p]:m-0 [&>ul]:m-0 [&>ol]:m-0">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    ) : (
                      m.content
                    )}
                  </div>
                  {m.role === "user" && (
                    <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-1">
                      <User className="w-3.5 h-3.5 text-secondary-foreground" />
                    </div>
                  )}
                </div>
              ))}
              {loading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="bg-muted/60 px-3 py-2 rounded-xl rounded-bl-sm">
                    <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                    </span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="px-3 py-3 border-t border-border/30 bg-card/50">
              <form
                onSubmit={(e) => { e.preventDefault(); send(); }}
                className="flex gap-2"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type a message…"
                  className="flex-1 bg-muted/40 border border-border/30 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 text-white flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
