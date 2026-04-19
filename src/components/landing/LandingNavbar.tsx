import { Link } from "react-router-dom";
import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Home, LayoutGrid, FileText, DollarSign, HelpCircle, ChevronDown, Mic, Brain, BarChart3, BookOpen, Newspaper, TrendingUp, Lightbulb, Users, GraduationCap, Zap, Calendar, MessageSquare, Shield, Clock, ArrowRight, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { blogCategories, blogPosts } from "@/data/blogData";
import { useTheme } from "@/components/providers/ThemeProvider";

const featuresDropdown = [
  { icon: Mic, label: "Live Recording", description: "Record meetings in real-time", href: "/features#live-recording" },
  { icon: Brain, label: "AI Summaries", description: "Auto-generated meeting notes", href: "/features#ai-summaries" },
  { icon: BarChart3, label: "Analytics", description: "Track meeting insights", href: "/features#analytics" },
  { icon: Users, label: "Team Collaboration", description: "Share & collaborate easily", href: "/features#team-collaboration" },
  { icon: Zap, label: "Real-Time Processing", description: "Live transcription during meetings", href: "/features#real-time" },
  { icon: Calendar, label: "Calendar Sync", description: "Integrates with your calendar", href: "/features#calendar-sync" },
  { icon: MessageSquare, label: "AI Chat Assistant", description: "Ask anything about your meetings", href: "/features#ai-chat" },
  { icon: Shield, label: "Enterprise Security", description: "End-to-end encryption & compliance", href: "/features#security" },
];

const blogsDropdown = blogCategories.map((cat) => ({
  icon: cat.icon,
  label: cat.label,
  description: cat.description,
  href: cat.slug === "all" ? "/blog" : `/blog/${cat.slug}`,
}));

const resourcesDropdown = [
  { icon: BookOpen, label: "How It Works", description: "Step-by-step guide", href: "/how-it-works" },
  { icon: HelpCircle, label: "Help Center", description: "40+ FAQs & support", href: "/help-center" },
  { icon: Users, label: "About Us", description: "Our story & mission", href: "/about" },
  { icon: MessageSquare, label: "Contact", description: "Get in touch", href: "/contact" },
];

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  hasDropdown: boolean;
  dropdownItems?: { icon: React.ElementType; label: string; description: string; href: string }[];
}

const navLinks: NavItem[] = [
  { label: "Home", href: "/", icon: Home, hasDropdown: false },
  { label: "Features", href: "#features", icon: LayoutGrid, hasDropdown: true, dropdownItems: featuresDropdown },
  { label: "Blogs", href: "#", icon: FileText, hasDropdown: true, dropdownItems: blogsDropdown },
  { label: "Pricing", href: "/pricing", icon: DollarSign, hasDropdown: false },
  { label: "Resources", href: "#", icon: HelpCircle, hasDropdown: true, dropdownItems: resourcesDropdown },
];

const whyWrapUp = [
  { icon: Zap, label: "Save Time", description: "Cut meeting follow-ups by up to 90%" },
  { icon: Brain, label: "AI-Powered Insights", description: "Get smart summaries & action items instantly" },
  { icon: TrendingUp, label: "Boost Productivity", description: "Focus on discussions, not note-taking" },
];

function FeaturesMegaMenu({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          style={{ left: '50%', transform: 'translateX(-50%)' }}
          className="absolute top-full mt-2 w-[700px] rounded-xl border border-border/40 bg-card backdrop-blur-xl shadow-2xl shadow-black/30 overflow-hidden z-50"
        >
          <div className="flex">
            {/* Left panel */}
            <div className="w-[220px] bg-accent/20 border-r border-border/30 p-5 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground mb-1">Why WrapUp?</h3>
                <p className="text-xs text-muted-foreground mb-4">Revolutionize your meetings with our AI-powered platform.</p>
                <div className="flex flex-col gap-3">
                  {whyWrapUp.map((item) => (
                    <div key={item.label} className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <item.icon size={13} className="text-primary" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-primary">{item.label}</div>
                        <div className="text-[11px] text-muted-foreground leading-tight">{item.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <Link
                to="#pricing"
                onClick={() => setOpen(false)}
                className="text-xs text-primary hover:text-primary/80 mt-5 flex items-center gap-1 transition-colors"
              >
                View pricing →
              </Link>
            </div>

            {/* Right panel */}
            <div className="flex-1 p-5">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Key Features</div>
              <div className="grid grid-cols-2 gap-1">
                {featuresDropdown.map((dropItem) => (
                  <Link
                    key={dropItem.label}
                    to={dropItem.href}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/30 transition-colors duration-150 group"
                  >
                    <div className="mt-0.5 w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <dropItem.icon size={16} className="text-primary" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{dropItem.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{dropItem.description}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-border/30 px-5 py-2.5 flex items-center gap-6">
            <Link to="/features" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5">
              <LayoutGrid size={12} /> All Features
            </Link>
            <Link to="#pricing" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5">
              <DollarSign size={12} /> Compare Plans
            </Link>
            <Link to="#" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5">
              <BookOpen size={12} /> View Tutorials
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BlogsMegaMenu({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const featuredPosts = blogPosts.filter((p) => p.featured).slice(0, 2);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          style={{ left: '50%', transform: 'translateX(-50%)' }}
          className="absolute top-full mt-2 w-[720px] rounded-xl border border-border/40 bg-card backdrop-blur-xl shadow-2xl shadow-black/30 overflow-hidden z-50"
        >
          <div className="flex">
            {/* Left panel: categories */}
            <div className="w-[380px] border-r border-border/30 p-5">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Blog Categories</div>
              <div className="grid grid-cols-2 gap-1">
                {blogCategories.map((cat) => (
                  <Link
                    key={cat.slug}
                    to={cat.slug === "all" ? "/blog" : `/blog/${cat.slug}`}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg hover:bg-accent/30 transition-colors duration-150 group"
                  >
                    <div className="mt-0.5 w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <cat.icon size={14} className="text-primary" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{cat.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{cat.description}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Right panel: featured articles */}
            <div className="flex-1 p-5 bg-accent/10">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Featured Articles</div>
              <div className="flex flex-col gap-3">
                {featuredPosts.map((post) => (
                  <Link
                    key={post.id}
                    to={`/blog/post/${post.id}`}
                    onClick={() => setOpen(false)}
                    className="group rounded-lg border border-border/20 bg-card/60 overflow-hidden hover:border-primary/30 transition-all duration-200"
                  >
                    <div className="h-20 overflow-hidden">
                      {post.image ? (
                        <img src={post.image} alt={post.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className={`h-full flex items-center justify-center ${post.gradient ? `bg-gradient-to-br ${post.gradient}` : "bg-accent/30"}`}>
                          <div className="w-8 h-8 rounded-md bg-primary/20 flex items-center justify-center">
                            {(() => {
                              const cat = blogCategories.find(c => c.slug === post.category);
                              return cat ? <cat.icon size={16} className="text-primary" /> : null;
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      {!post.headlineOnly && (
                        <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1 mb-1">{post.title}</div>
                      )}
                      <p className="text-[11px] text-muted-foreground line-clamp-2">{post.excerpt}</p>
                    </div>
                  </Link>
                ))}
              </div>
              <Link
                to="/blog"
                onClick={() => setOpen(false)}
                className="text-xs text-primary hover:text-primary/80 mt-3 flex items-center gap-1 transition-colors"
              >
                View all articles <ArrowRight size={11} />
              </Link>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SmallDropdown({ items, open, setOpen }: { items: { icon: React.ElementType; label: string; description: string; href: string }[]; open: boolean; setOpen: (v: boolean) => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="absolute top-full left-0 mt-2 w-72 rounded-xl border border-border/40 bg-card/95 backdrop-blur-xl shadow-2xl shadow-black/30 overflow-hidden z-50"
        >
          <div className="p-2">
            {items.map((dropItem) => (
              <Link
                key={dropItem.label}
                to={dropItem.href}
                onClick={() => setOpen(false)}
                className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/30 transition-colors duration-150 group"
              >
                <div className="mt-0.5 w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                  <dropItem.icon size={16} className="text-primary" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{dropItem.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{dropItem.description}</div>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function NavDropdown({ item }: { item: NavItem }) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  };

  const handleLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  if (!item.hasDropdown || !item.dropdownItems) {
    return (
      <Link
        to={item.href}
        className="flex items-center gap-1.5 text-base text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all duration-200 px-5 py-2.5 rounded-lg"
      >
        <item.icon size={16} className="opacity-60" />
        {item.label}
      </Link>
    );
  }

  const isFeatures = item.label === "Features";
  const isBlogs = item.label === "Blogs";

  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <a
        href={item.href}
        className={`flex items-center gap-1.5 text-base transition-all duration-200 px-5 py-2.5 rounded-lg ${
          open ? "text-foreground bg-accent/50" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
        }`}
      >
        <item.icon size={16} className="opacity-60" />
        {item.label}
        <ChevronDown size={13} className={`opacity-50 ml-0.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </a>

      {isFeatures ? (
        <FeaturesMegaMenu open={open} setOpen={setOpen} />
      ) : isBlogs ? (
        <BlogsMegaMenu open={open} setOpen={setOpen} />
      ) : (
        <SmallDropdown items={item.dropdownItems} open={open} setOpen={setOpen} />
      )}
    </div>
  );
}

export default function LandingNavbar() {
  const [open, setOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-0 left-0 right-0 z-50 w-full"
    >
      <div className="px-6 md:px-12 lg:px-20 py-4 flex items-center justify-center">
        {/* Logo */}
        <Link to="/" className="absolute left-6 md:left-12 lg:left-20 flex items-center shrink-0 text-2xl font-bold gradient-text tracking-tight">
          🎙️ WrapUp
        </Link>

        {/* Center nav links */}
        <div className="hidden md:flex items-center gap-1 px-2 py-1.5 rounded-xl border border-border/30 bg-card/40 backdrop-blur-xl shadow-lg shadow-black/10">
          {navLinks.map((l) => (
            <NavDropdown key={l.label} item={l} />
          ))}
        </div>

        {/* Right side auth buttons + theme toggle */}
        <div className="absolute right-6 md:right-12 lg:right-20 hidden md:flex items-center gap-3 shrink-0">
          <Link to="/login" className="rounded-xl border border-primary/40 bg-transparent text-foreground text-base font-medium px-7 py-2.5 transition-all duration-300 hover:bg-primary/15 hover:border-primary/70 hover:shadow-[0_0_18px_-3px_hsl(265,90%,65%/0.45)]">
            Log in
          </Link>
          <Link to="/signup" className="rounded-xl border border-border/40 bg-card/60 text-foreground text-base font-medium px-7 py-2.5 transition-all duration-300 hover:bg-accent/50 hover:border-foreground/25 hover:shadow-[0_0_20px_-3px_hsl(0,0%,100%/0.12)]">
            Sign up
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden w-10 h-10 rounded-lg flex flex-col items-center justify-center gap-[5px]"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          <span className={`block w-5 h-[2px] bg-muted-foreground rounded-full transition-all duration-300 ${open ? "rotate-45 translate-y-[7px]" : ""}`} />
          <span className={`block w-5 h-[2px] bg-muted-foreground rounded-full transition-all duration-300 ${open ? "opacity-0" : ""}`} />
          <span className={`block w-5 h-[2px] bg-muted-foreground rounded-full transition-all duration-300 ${open ? "-rotate-45 -translate-y-[7px]" : ""}`} />
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden bg-background/95 backdrop-blur-xl border-b border-border/20 overflow-hidden"
          >
            <div className="p-5 flex flex-col gap-1">
              {navLinks.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  className="flex items-center gap-2 text-sm text-muted-foreground py-2.5 px-3 rounded-lg hover:bg-accent/50 hover:text-foreground active:bg-accent/60 transition-all duration-200"
                  onClick={() => setOpen(false)}
                >
                  <l.icon size={15} className="opacity-60" />
                  {l.label}
                  {l.hasDropdown && <ChevronDown size={13} className="opacity-50 ml-auto" />}
                </a>
              ))}
              <div className="flex items-center gap-2 pt-3">
                <Button variant="outline" size="sm" asChild className="flex-1 rounded-full border-border/50 bg-transparent">
                  <Link to="/login">Log in</Link>
                </Button>
                <Button size="sm" className="gradient-bg text-primary-foreground flex-1 rounded-full" asChild>
                  <Link to="/signup">Sign up</Link>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
