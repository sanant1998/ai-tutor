import { Header } from "@/components/Header";
import { ScrollProgress } from "@/components/motion";
import { SmoothScroll } from "@/components/SmoothScroll";
import { Accessibility } from "@/components/sections/Accessibility";
import { Bento } from "@/components/sections/Bento";
import { Boards } from "@/components/sections/Boards";
import { Compare } from "@/components/sections/Compare";
import { Cta } from "@/components/sections/Cta";
import { Faq } from "@/components/sections/Faq";
import { Footer } from "@/components/sections/Footer";
import { Hero } from "@/components/sections/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Pricing } from "@/components/sections/Pricing";
import { SeoMirror } from "@/components/sections/SeoMirror";
import { Testimonials } from "@/components/sections/Testimonials";
import { TrustStrip } from "@/components/sections/TrustStrip";

export default function LandingPage() {
  return (
    <>
      <SmoothScroll />
      <ScrollProgress />
      <Header />

      <main className="relative overflow-x-hidden">
        <Hero />
        <TrustStrip />
        <Bento />
        <HowItWorks />
        <Compare />
        <Boards />
        <Accessibility />
        <Testimonials />
        <Pricing />
        <Faq />
        <Cta />
      </main>

      <Footer />
      <SeoMirror />
    </>
  );
}
