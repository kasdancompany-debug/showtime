"use client";

import { motion } from "framer-motion";

export function SpotlightWash() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -left-1/4 top-[-20%] h-[70%] w-[70%] rounded-full bg-[radial-gradient(closest-side,rgba(212,175,55,0.14),transparent)] blur-3xl"
        animate={{ opacity: [0.5, 0.85, 0.55], x: [0, 24, -8] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-1/4 bottom-[-10%] h-[60%] w-[60%] rounded-full bg-[radial-gradient(closest-side,rgba(94,234,212,0.1),transparent)] blur-3xl"
        animate={{ opacity: [0.4, 0.75, 0.45], x: [0, -18, 10] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
