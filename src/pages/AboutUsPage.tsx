import { useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Target, Eye, Heart, Globe, Zap, Shield, User } from "lucide-react";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import StarfieldBackground from "@/components/landing/StarfieldBackground";
import Footer from "@/components/landing/Footer";


const values = [
  { icon: Zap, title: "Innovation First", desc: "We push the boundaries of AI to deliver meeting intelligence that feels magical." },
  { icon: Shield, title: "Privacy by Design", desc: "Your data security is not an afterthought — it's built into everything we do." },
  { icon: Heart, title: "User-Centric", desc: "Every feature is designed to save you time and make meetings more productive." },
  { icon: Globe, title: "Global Accessibility", desc: "90+ languages supported, making WrapUp accessible to teams worldwide." },
];

const teamLeader = {
  name: "Md. Fahmid Hossain Hamim",
  role: "Founder, Project Lead & Full-Stack Developer",
  avatar: "/teamleader.jpeg",
};

const advisor = {
  name: "Dr. Shazzad Hosain",
  title: "Professor & Dean",
  role: "Project Advisor",
  avatar: "/advisor.jpeg",
};

const teamMembers: { name: string; role: string; avatar: string | null }[] = [
  { name: "Md Nahid Hassan", role: "Desktop App Developer", avatar: "/nahid.jpeg" },
  { name: "Rakibul Karim Rakib", role: "RAG Engineer", avatar: "/rakib.jpeg" },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  }),
};

export default function AboutUsPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="dark cinema-gradient text-foreground min-h-screen overflow-x-hidden relative">
      <StarfieldBackground />
      <LandingNavbar />

      <section className="relative pt-32 pb-36">
        <div className="container mx-auto px-4 max-w-5xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-6">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-8">
              <ArrowLeft className="h-4 w-4" /> Back to Home
            </Link>
          </motion.div>

          {/* Hero */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-center mb-20">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium border border-primary/20 text-primary mb-6 backdrop-blur-sm bg-primary/5">
              Our Story & Mission
            </span>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
              About <span className="gradient-text">WrapUp</span>
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto text-base leading-relaxed">
              We started WrapUp because we believed no one should spend more time writing meeting notes than actually making decisions. Our AI-powered platform helps teams focus on what matters — the conversation.
            </p>
          </motion.div>

          {/* Mission & Vision */}
          <div className="grid md:grid-cols-2 gap-6 mb-20">
            {[
              { icon: Target, title: "Our Mission", text: "To eliminate the busywork of meetings so teams can focus on collaboration, creativity, and outcomes. We're building the future where every meeting is instantly actionable." },
              { icon: Eye, title: "Our Vision", text: "A world where no valuable insight is ever lost in a meeting. Where AI handles the documentation so humans can focus on the thinking that matters." },
            ].map((item, i) => (
              <motion.div key={item.title} initial="hidden" animate="visible" variants={fadeUp} custom={i} className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-8 hover:border-primary/20 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
                  <item.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.text}</p>
              </motion.div>
            ))}
          </div>

{/* Values */}
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-32">
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">
              Our <span className="gradient-text">Values</span>
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {values.map((v, i) => (
                <motion.div key={v.title} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i} className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-6 hover:border-primary/20 transition-all duration-300 text-center">
                  <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <v.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground mb-2">{v.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{v.desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Team */}
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <div className="text-center mb-12">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium border border-primary/20 text-primary mb-5 backdrop-blur-sm bg-primary/5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                </span>
                The People Behind WrapUp
              </span>
              <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
                Meet the{" "}
                <span className="relative inline-block">
                  <span className="bg-gradient-to-r from-primary via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
                    Team
                  </span>
                  <span className="absolute -bottom-1 left-0 w-full h-[3px] bg-gradient-to-r from-primary via-fuchsia-400 to-cyan-400 rounded-full opacity-70" aria-hidden />
                </span>
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
                A small group of engineers and a faculty advisor turning meetings into moments that matter.
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-6 items-stretch">
              {/* Team Leader — featured */}
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                custom={0}
                className="lg:col-span-1 relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.08] via-primary/[0.04] to-cyan-500/[0.08] border border-primary/20 p-10 hover:border-primary/40 hover:-translate-y-1 hover:shadow-[0_12px_40px_-12px_rgba(139,92,246,0.45)] transition-all duration-300 text-center group flex flex-col items-center justify-center"
              >
                <div className="absolute -top-24 -left-24 w-56 h-56 rounded-full bg-primary/20 blur-3xl opacity-60 group-hover:opacity-90 transition-opacity duration-500" aria-hidden />
                <div className="absolute -bottom-24 -right-24 w-56 h-56 rounded-full bg-cyan-500/20 blur-3xl opacity-60 group-hover:opacity-90 transition-opacity duration-500" aria-hidden />

                <span className="relative inline-flex items-center gap-1.5 px-3 py-1 mb-4 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-gradient-to-r from-primary/20 to-cyan-500/20 text-primary border border-primary/30">
                  Project Lead
                </span>
                <div className="relative mb-5">
                  <div className="absolute inset-0 -m-3 rounded-full bg-gradient-to-br from-primary/40 to-cyan-400/40 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" aria-hidden />
                  <img
                    src={teamLeader.avatar}
                    alt={teamLeader.name}
                    className="relative w-36 h-36 rounded-full object-cover ring-2 ring-primary/50 ring-offset-4 ring-offset-background group-hover:ring-primary/80 transition-all duration-300"
                  />
                </div>
                <h3 className="relative text-xl font-bold text-foreground">{teamLeader.name}</h3>
                <p className="relative text-sm mt-1.5 bg-gradient-to-r from-primary via-primary/80 to-cyan-400 bg-clip-text text-transparent font-medium">
                  {teamLeader.role}
                </p>
              </motion.div>

              {/* Right side: Advisor + 2 members */}
              <div className="lg:col-span-2 grid sm:grid-cols-2 gap-6">
                <motion.a
                  href="https://ece.northsouth.edu/people/shazzad-hosain/"
                  target="_blank"
                  rel="noopener noreferrer"
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  custom={1}
                  className="sm:col-span-2 relative rounded-2xl bg-amber-500/[0.06] border border-amber-500/20 p-8 hover:border-amber-400/50 hover:-translate-y-1 hover:shadow-[0_12px_40px_-12px_rgba(251,191,36,0.45)] transition-all duration-300 text-center group block cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
                  aria-label={`${advisor.name} — ${advisor.role} (opens profile in new tab)`}
                >
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 mb-4 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    Advisor
                  </span>
                  <div className="relative mx-auto w-fit mb-4">
                    <div className="absolute inset-0 -m-3 rounded-full bg-amber-400/30 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" aria-hidden />
                    <img
                      src={advisor.avatar}
                      alt={advisor.name}
                      className="relative w-28 h-28 rounded-full object-cover ring-2 ring-amber-500/50 ring-offset-4 ring-offset-background group-hover:ring-amber-400/80 transition-all duration-300"
                    />
                  </div>
                  <h3 className="text-base font-bold text-foreground">{advisor.name}</h3>
                  <p className="text-sm font-bold text-white mt-1">({advisor.title})</p>
                  <p className="text-sm text-amber-300 mt-1">{advisor.role}</p>
                </motion.a>

                {teamMembers.map((member, i) => (
                  <motion.div
                    key={member.name}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    variants={fadeUp}
                    custom={i + 2}
                    className="relative rounded-2xl bg-white/[0.02] border border-white/[0.06] p-6 hover:border-white/20 hover:-translate-y-1 hover:shadow-[0_12px_40px_-12px_rgba(255,255,255,0.18)] transition-all duration-300 text-center group"
                  >
                    <div className="relative mx-auto w-fit mb-4">
                      <div className="absolute inset-0 -m-3 rounded-full bg-white/10 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" aria-hidden />
                      {member.avatar ? (
                        <img
                          src={member.avatar}
                          alt={member.name}
                          className="relative w-24 h-24 rounded-full object-cover ring-2 ring-border/40 ring-offset-4 ring-offset-background group-hover:ring-white/40 transition-all duration-300"
                        />
                      ) : (
                        <div className="relative w-24 h-24 rounded-full ring-2 ring-border/40 ring-offset-4 ring-offset-background group-hover:ring-white/40 transition-all duration-300 bg-white/[0.04] flex items-center justify-center">
                          <User className="w-10 h-10 text-muted-foreground/60" />
                        </div>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-foreground">{member.name}</h3>
                    <p className="text-xs text-primary mt-1">{member.role}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
