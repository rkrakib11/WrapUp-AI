import { useState } from "react";
import { ArrowRight, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import ExternalLink from "@/components/common/ExternalLink";

const contactCards = [
  {
    title: "Email Us",
    subtitle: "hello@wrapup.ai",
    subtitleColor: "text-red-400",
    iconBg: "bg-red-500/10",
    hoverBorder: "hover:border-red-500/50",
    iconUrl: "https://cdn.iconscout.com/icon/free/png-256/free-gmail-logo-icon-svg-download-png-2476484.png?f=webp&w=128",
    iconAlt: "Gmail",
    href: "mailto:hello@wrapup.ai",
  },
  {
    title: "Chat With Us",
    subtitle: "Start a Chat",
    subtitleColor: "text-green-400",
    iconBg: "bg-green-500/10",
    hoverBorder: "hover:border-green-500/50",
    iconUrl: "https://cdn.iconscout.com/icon/free/png-256/free-whatsapp-icon-svg-download-png-189793.png?f=webp&w=128",
    iconAlt: "WhatsApp",
    href: "https://wa.me/",
  },
  {
    title: "Follow Us",
    subtitle: "Facebook",
    subtitleColor: "text-blue-400",
    iconBg: "bg-blue-500/10",
    hoverBorder: "hover:border-blue-500/50",
    iconUrl: "https://cdn.simpleicons.org/facebook/1877F2",
    iconAlt: "Facebook",
    href: "https://facebook.com/",
  },
  {
    title: "Follow Us",
    subtitle: "Instagram",
    subtitleColor: "text-pink-400",
    iconBg: "bg-pink-500/10",
    hoverBorder: "hover:border-pink-500/50",
    iconUrl: "https://cdn.simpleicons.org/instagram/E4405F",
    iconAlt: "Instagram",
    href: "https://instagram.com/",
  },
];

export default function ContactSection() {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", email: "", institution: "", message: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    toast({ title: "Message sent!", description: "We'll get back to you soon." });
    setForm({ name: "", email: "", institution: "", message: "" });
  };

  return (
    <section id="contact" className="py-32 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] pointer-events-none">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-600/10 via-cyan-500/8 to-purple-800/10 blur-[100px]" />
        <div className="absolute inset-[15%] rounded-full bg-gradient-to-tr from-cyan-400/6 via-transparent to-purple-500/8 blur-[80px]" />
      </div>

      <div className="container mx-auto px-4 relative z-10 max-w-5xl">
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold mb-4 tracking-tight">Get in Touch</h2>
          <p className="text-muted-foreground text-base">Have questions or need support? We're here to help!</p>
        </div>

        <div className="grid lg:grid-cols-[380px_1fr] gap-6 items-start">
          <div className="flex flex-col gap-4">
            {contactCards.map((card) => (
              <ExternalLink
                key={card.title}
                href={card.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-4 px-5 py-5 rounded-xl border border-border/30 bg-[hsl(222,30%,8%)]/50 backdrop-blur-xl ${card.hoverBorder} transition-all duration-300 group cursor-pointer no-underline`}
              >
                <div className={`w-11 h-11 rounded-xl ${card.iconBg} flex items-center justify-center shrink-0`}>
                  <img src={card.iconUrl} alt={card.iconAlt} className="w-7 h-7 object-contain transition-transform duration-300 group-hover:scale-125" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">{card.title}</div>
                  <div className={`text-xs ${card.subtitleColor}`}>{card.subtitle}</div>
                </div>
                <ArrowRight size={16} className="text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
              </ExternalLink>
            ))}
          </div>

          <div className="relative rounded-xl overflow-hidden border border-transparent hover:border-primary/40 transition-all duration-300">
            <div className="absolute bottom-0 left-[10%] right-[10%] h-[2px] bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
            <div className="absolute bottom-0 left-[15%] right-[15%] h-[20px] bg-gradient-to-t from-primary/10 to-transparent blur-md" />

            <form
              onSubmit={handleSubmit}
              className="rounded-xl border border-border/30 bg-[hsl(222,30%,8%)]/50 backdrop-blur-xl p-7 space-y-5"
            >
              <h3 className="text-lg font-bold text-foreground mb-1">Send Us a Message</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">
                    Your Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    placeholder="John Doe"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    maxLength={100}
                    className="bg-background/40 border-border/30 focus:border-primary/50 h-11"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">
                    Your Email <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="email"
                    placeholder="your.email@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    maxLength={255}
                    className="bg-background/40 border-border/30 focus:border-primary/50 h-11"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Institution (Optional)</label>
                <Input
                  placeholder="Your Institution Name"
                  value={form.institution}
                  onChange={(e) => setForm({ ...form, institution: e.target.value })}
                  maxLength={200}
                  className="bg-background/40 border-border/30 focus:border-primary/50 h-11"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">
                  Your Message <span className="text-destructive">*</span>
                </label>
                <Textarea
                  placeholder="Type your message here..."
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  maxLength={1000}
                  rows={5}
                  className="bg-background/40 border-border/30 focus:border-primary/50 resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full h-12 rounded-lg border border-border/40 bg-[hsl(222,20%,12%)] text-foreground text-sm font-medium flex items-center justify-center gap-2 hover:border-primary/50 hover:bg-primary/10 transition-all duration-300"
              >
                Send Message <Send size={14} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
