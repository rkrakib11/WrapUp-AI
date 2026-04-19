import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Send, MapPin, Clock, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import StarfieldBackground from "@/components/landing/StarfieldBackground";
import Footer from "@/components/landing/Footer";
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

const infoCards = [
  { icon: MapPin, title: "Office", desc: "San Francisco, CA" },
  { icon: Clock, title: "Hours", desc: "Mon–Fri, 9AM–6PM PST" },
  { icon: Mail, title: "Support", desc: "support@wrapup.ai" },
];

export default function ContactPage() {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", email: "", institution: "", message: "" });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

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
    <div className="dark cinema-gradient text-foreground min-h-screen overflow-x-hidden relative">
      <StarfieldBackground />
      <LandingNavbar />

      <section className="relative pt-32 pb-24">
        <div className="container mx-auto px-4 max-w-5xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-6">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-8">
              <ArrowLeft className="h-4 w-4" /> Back to Home
            </Link>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-center mb-16">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium border border-primary/20 text-primary mb-6 backdrop-blur-sm bg-primary/5">
              Get in Touch
            </span>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
              Contact <span className="gradient-text">Us</span>
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Have questions, feedback, or need support? We'd love to hear from you.
            </p>
          </motion.div>

          {/* Info cards */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6 }} className="grid sm:grid-cols-3 gap-4 mb-12">
            {infoCards.map((c) => (
              <div key={c.title} className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-5 text-center hover:border-primary/20 transition-all duration-300">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <c.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="text-sm font-semibold text-foreground">{c.title}</div>
                <div className="text-xs text-muted-foreground mt-1">{c.desc}</div>
              </div>
            ))}
          </motion.div>

          {/* Contact form + social cards */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }}>
            <div className="grid lg:grid-cols-[380px_1fr] gap-6 items-start">
              <div className="flex flex-col gap-4">
                {contactCards.map((card) => (
                  <ExternalLink
                    key={card.subtitle}
                    href={card.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-4 px-5 py-5 rounded-xl border border-border/30 bg-white/[0.02] backdrop-blur-xl ${card.hoverBorder} transition-all duration-300 group cursor-pointer no-underline`}
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
                <form onSubmit={handleSubmit} className="rounded-xl border border-border/30 bg-white/[0.02] backdrop-blur-xl p-7 space-y-5">
                  <h3 className="text-lg font-bold text-foreground mb-1">Send Us a Message</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">Your Name <span className="text-destructive">*</span></label>
                      <Input placeholder="John Doe" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} className="bg-background/40 border-border/30 focus:border-primary/50 h-11" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">Your Email <span className="text-destructive">*</span></label>
                      <Input type="email" placeholder="your.email@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} className="bg-background/40 border-border/30 focus:border-primary/50 h-11" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Institution (Optional)</label>
                    <Input placeholder="Your Institution Name" value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} maxLength={200} className="bg-background/40 border-border/30 focus:border-primary/50 h-11" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Your Message <span className="text-destructive">*</span></label>
                    <Textarea placeholder="Type your message here..." value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} maxLength={1000} rows={5} className="bg-background/40 border-border/30 focus:border-primary/50 resize-none" />
                  </div>
                  <button type="submit" className="w-full h-12 rounded-lg border border-border/40 bg-white/[0.03] text-foreground text-sm font-medium flex items-center justify-center gap-2 hover:border-primary/50 hover:bg-primary/10 transition-all duration-300">
                    Send Message <Send size={14} />
                  </button>
                </form>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
