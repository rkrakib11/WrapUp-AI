import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Sparkles, Grid2x2, CreditCard, Users, HelpCircle, BookOpen, MessageSquare, UserCircle, Shield, FileText, Database, Accessibility } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import ExternalLink from "@/components/common/ExternalLink";

const productLinks = [
  { label: "Features", href: "/features", icon: Sparkles },
  { label: "How It Works", href: "/#demo", icon: Grid2x2 },
  { label: "Pricing", href: "/pricing", icon: CreditCard },
  { label: "Sign In", href: "/login", icon: Users },
];

const resourceLinks = [
  { label: "Help Center", href: "#", icon: HelpCircle },
  { label: "Blog", href: "/blog", icon: BookOpen },
  { label: "Contact Us", href: "/#contact", icon: MessageSquare },
  { label: "About Us", href: "#", icon: UserCircle },
];

const legalLinks = [
  { label: "Privacy Policy", href: "#", icon: Shield },
  { label: "Terms of Service", href: "#", icon: FileText },
  { label: "Data Policy", href: "#", icon: Database },
  { label: "Accessibility", href: "#", icon: Accessibility },
];

export default function Footer() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    toast({ title: "Subscribed!", description: "You'll receive our latest updates." });
    setEmail("");
  };

  return (
    <footer className="relative border-t border-border/30 pt-16 pb-10 overflow-hidden">
      {/* Aurora glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-purple-600/10 via-cyan-500/5 to-transparent blur-[120px] rounded-full" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10 mb-14">
          {/* Brand */}
          <div className="lg:col-span-1">
            <Link to="/" className="text-xl font-bold gradient-text tracking-tight inline-block mb-3">
              🎙️ WrapUp
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              Revolutionizing meetings with AI-powered conversation summarization and insights.
            </p>
            <ExternalLink href="mailto:hello@wrapup.ai" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Mail size={14} />
              hello@wrapup.ai
            </ExternalLink>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-sm font-bold text-foreground mb-4">Product</h4>
            <ul className="space-y-3">
              {productLinks.map((item) => (
                <li key={item.label}>
                  <Link to={item.href} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                    <item.icon size={14} className="text-primary/60" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-sm font-bold text-foreground mb-4">Resources</h4>
            <ul className="space-y-3">
              {resourceLinks.map((item) => (
                <li key={item.label}>
                  <Link to={item.href} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                    <item.icon size={14} className="text-primary/60" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-bold text-foreground mb-4">Legal</h4>
            <ul className="space-y-3">
              {legalLinks.map((item) => (
                <li key={item.label}>
                  <Link to={item.href} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                    <item.icon size={14} className="text-primary/60" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Stay Connected */}
          <div>
            <h4 className="text-sm font-bold text-foreground mb-4">Stay Connected</h4>
            <p className="text-sm text-muted-foreground mb-4">Subscribe to our newsletter for updates.</p>
            <form onSubmit={handleSubscribe} className="flex gap-2">
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-background/40 border-border/30 focus:border-primary/50 h-10 text-sm"
              />
              <button
                type="submit"
                className="shrink-0 h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Subscribe
              </button>
            </form>

            {/* Social icons */}
            <div className="flex items-center gap-4 mt-5">
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="LinkedIn">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Twitter">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                  <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                </svg>
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="GitHub">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border/30 pt-6 text-center">
          <p className="text-xs text-muted-foreground">© 2026 WrapUp. All rights reserved.</p>
          <p className="text-xs text-muted-foreground mt-1">Made with ❤️ for productive teams worldwide.</p>
        </div>
      </div>
    </footer>
  );
}
