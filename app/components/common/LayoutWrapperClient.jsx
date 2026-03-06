"use client";
import React, { useEffect, useState, useRef } from "react";
import SplashTransition from "./SplashTransition";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import AboutUsModal from "../../components/common/AboutUsModal";
import { LanguageProvider } from "../../context/LanguageContext";

function LayoutWrapperClient({ children }) {
  const pathname = usePathname();
  const prevPathRef = useRef(pathname);
  const isPricingDetails = pathname?.includes("/pricing/price-details");
  const [isAnimating, setIsAnimating] = useState(!isPricingDetails);
  const [showSplash, setShowSplash] = useState(!isPricingDetails); // Splash is mounted
  const [showContent, setShowContent] = useState(isPricingDetails); // Controls when content is visible
  const [aboutUsOpen, setAboutUsOpen] = useState(false);

  useEffect(() => {
    // Skip splash transition between /pricing and /pricing/price-details (both ways)
    const isToDetails = pathname?.includes("/pricing/price-details");
    const isFromDetails = prevPathRef.current?.includes(
      "/pricing/price-details",
    );
    const isToPricingBase = pathname?.includes("/pricing") && !isToDetails;

    if (isToDetails || (isFromDetails && isToPricingBase)) {
      setIsAnimating(false);
      setShowSplash(false);
      setShowContent(true);
      return;
    }

    setIsAnimating(true);
    setShowSplash(true);
    setShowContent(false);

    // Reveal content when yellow overlay goes off (after 1.8s: 0.8s logo + 1s yellow overlay)
    const revealContentTimeout = setTimeout(() => {
      setShowContent(true);
    }, 2500); // 0.8s (logo) + 1s (yellow overlay)

    // Start splash exit after total animation (2.7s)
    const animTimeout = setTimeout(() => {
      setIsAnimating(false);
      // Wait for exit animation (0.6s) before unmounting splash
      const exitTimeout = setTimeout(() => {
        setShowSplash(false);
      }, 700); // Match exit duration + buffer
      return () => clearTimeout(exitTimeout);
    }, 2700);

    return () => {
      setIsAnimating(false);
      setShowSplash(false);
      setShowContent(false);
      clearTimeout(animTimeout);
      clearTimeout(revealContentTimeout);
    };
  }, [pathname]);

  useEffect(() => {
    prevPathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    window.openAboutUsModal = () => setAboutUsOpen(true);
    return () => {
      window.openAboutUsModal = undefined;
    };
  }, []);

  return (
    <LanguageProvider>
      <AboutUsModal open={aboutUsOpen} onClose={() => setAboutUsOpen(false)} />
      {showSplash && <SplashTransition isAnimating={isAnimating} />}
      {showContent && children}
    </LanguageProvider>
  );
}

export default LayoutWrapperClient;
