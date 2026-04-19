import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ChevronDown, Search, BookOpen, Headphones, MessageSquare, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import StarfieldBackground from "@/components/landing/StarfieldBackground";
import Footer from "@/components/landing/Footer";
import { Input } from "@/components/ui/input";
import ExternalLink from "@/components/common/ExternalLink";
import { isExternalHref } from "@/lib/app-shell";

const faqCategories = [
  {
    title: "Getting Started",
    faqs: [
      { q: "How do I create my first meeting?", a: "After signing up, click 'New Meeting' from your dashboard. You can start a live recording or upload an existing audio/video file." },
      { q: "What formats are supported for upload?", a: "We support 40+ formats including MP3, MP4, WAV, WebM, FLAC, OGG, M4A, and more." },
      { q: "How do I invite team members?", a: "Go to Settings → Team and enter their email addresses. They'll receive an invitation to join your workspace." },
      { q: "Is there a browser extension?", a: "Yes! We offer Chrome and Firefox extensions for capturing meetings directly from Google Meet, Zoom Web, and Teams." },
    ],
  },
  {
    title: "AI & Transcription",
    faqs: [
      { q: "How accurate is the transcription?", a: "Our AI achieves 99.2% accuracy across 40+ languages, handling accents, overlapping speech, and technical jargon." },
      { q: "Can I edit transcriptions?", a: "Yes, you can manually edit any part. Corrections also help train the AI for better future accuracy." },
      { q: "How does speaker identification work?", a: "Our AI uses voice fingerprinting to automatically distinguish between speakers. You can also label them manually." },
      { q: "What languages are supported?", a: "90+ languages including English, Bangla, Spanish, French, German, Japanese, Chinese, Hindi, Arabic, and many more." },
    ],
  },
  {
    title: "Billing & Plans",
    faqs: [
      { q: "Can I try WrapUp for free?", a: "Yes! We offer a 14-day free trial with full access to all features. No credit card required." },
      { q: "Can I change my plan anytime?", a: "Absolutely. Upgrade or downgrade at any time — changes take effect immediately with prorated billing." },
      { q: "Do you offer annual discounts?", a: "Yes, annual billing saves 20%. We also offer special pricing for startups, nonprofits, and educational institutions." },
      { q: "What's your refund policy?", a: "We offer a 30-day money-back guarantee on all paid plans." },
    ],
  },
  {
    title: "Security & Privacy",
    faqs: [
      { q: "Is my data secure?", a: "All data is encrypted end-to-end with AES-256. We're SOC 2 Type II and GDPR compliant." },
      { q: "Where is my data stored?", a: "In SOC 2 compliant data centers. Enterprise customers can choose their preferred region (US, EU, APAC)." },
      { q: "Can I delete my recordings?", a: "Yes. Deleted data is permanently removed within 30 days. Enterprise plans offer immediate deletion." },
      { q: "Is WrapUp HIPAA compliant?", a: "Our Enterprise plan includes HIPAA compliance with Business Associate Agreements (BAAs)." },
    ],
  },
];

const supportChannels = [
  { icon: BookOpen, title: "Documentation", desc: "Browse guides and tutorials", href: "/how-it-works" },
  { icon: MessageSquare, title: "Live Chat", desc: "Chat with our support team", href: "/contact" },
  { icon: Mail, title: "Email Support", desc: "hello@wrapup.ai", href: "mailto:hello@wrapup.ai" },
  { icon: Headphones, title: "Schedule a Call", desc: "Book a 1-on-1 demo", href: "/contact" },
];

export default function HelpCenterPage() {
  const [openItems, setOpenItems] = useState<Record<string, number | null>>({});
  const [search, setSearch] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const toggleItem = (category: string, index: number) => {
    setOpenItems((prev) => ({ ...prev, [category]: prev[category] === index ? null : index }));
  };

  const filteredCategories = faqCategories.map((cat) => ({
    ...cat,
    faqs: cat.faqs.filter((f) => f.q.toLowerCase().includes(search.toLowerCase()) || f.a.toLowerCase().includes(search.toLowerCase())),
  })).filter((cat) => cat.faqs.length > 0);

  return (
    <div className="dark cinema-gradient text-foreground min-h-screen overflow-x-hidden relative">
      <StarfieldBackground />
      <LandingNavbar />

      <section className="relative pt-32 pb-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-6">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-8">
              <ArrowLeft className="h-4 w-4" /> Back to Home
            </Link>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-center mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium border border-primary/20 text-primary mb-6 backdrop-blur-sm bg-primary/5">
              40+ FAQs & Support
            </span>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
              Help <span className="gradient-text">Center</span>
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto mb-8">
              Find answers to common questions or reach out to our support team.
            </p>
            <div className="max-w-md mx-auto relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search for answers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-background/40 border-border/30 focus:border-primary/50 h-11"
              />
            </div>
          </motion.div>

          {/* Support Channels */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6 }} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
            {supportChannels.map((ch) => {
              const content = (
                <>
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-3 group-hover:bg-primary/20 transition-colors">
                    <ch.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="text-sm font-semibold text-foreground">{ch.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">{ch.desc}</div>
                </>
              );

              const className = "rounded-xl bg-white/[0.02] border border-white/[0.06] p-5 hover:border-primary/20 hover:bg-white/[0.04] transition-all duration-300 group text-center";

              return isExternalHref(ch.href) ? (
                <ExternalLink key={ch.title} href={ch.href} className={className}>
                  {content}
                </ExternalLink>
              ) : (
                <Link key={ch.title} to={ch.href} className={className}>
                  {content}
                </Link>
              );
            })}
          </motion.div>

          {/* FAQs */}
          {filteredCategories.map((category, catIdx) => (
            <motion.div key={category.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: catIdx * 0.08, duration: 0.5 }} className="mb-10">
              <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">{catIdx + 1}</span>
                {category.title}
              </h2>
              <div className="space-y-2">
                {category.faqs.map((faq, i) => (
                  <button key={i} onClick={() => toggleItem(category.title, i)} className="w-full text-left rounded-xl bg-white/[0.02] border border-white/[0.06] p-5 hover:border-emerald-400/30 hover:bg-emerald-400/[0.06] transition-all duration-300 group backdrop-blur-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm font-semibold text-foreground group-hover:text-emerald-200 transition-colors">{faq.q}</span>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-300 ${openItems[category.title] === i ? "rotate-180 text-primary" : ""}`} />
                    </div>
                    <motion.div initial={false} animate={{ height: openItems[category.title] === i ? "auto" : 0, opacity: openItems[category.title] === i ? 1 : 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                      <p className="text-sm text-muted-foreground leading-relaxed pt-3">{faq.a}</p>
                    </motion.div>
                  </button>
                ))}
              </div>
            </motion.div>
          ))}

          <div className="text-center mt-8">
            <Link to="/faqs" className="text-sm text-primary hover:text-primary/80 transition-colors">
              View all 50+ FAQs →
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
