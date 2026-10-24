// Amicro Diamond Grid — Copyright (c) 2026 SYED  SUBHAN UDDIN.
// MIT, see LICENSE. Source: Subhan-code/Amicro--Micro-transitions-
// commit dc2a183f3a5e6e0ea1b0d75530ac084e3a4e0bd2.
// Local adaptations: existing Motion import, plain CSS, inherited color,
// decorative semantics and reduced-motion support. Upstream has no props.
import { motion, useReducedMotion } from "motion/react";
import "./diamond-grid.css";

export function DiamondGrid() {
  const reduceMotion = useReducedMotion();
  return (
    <span className="diamond-grid" aria-hidden="true">
      {[0, 1, 2, 3].map((i) =>
        reduceMotion ? (
          <span key={i} className="diamond-grid__cell" />
        ) : (
          <motion.span
            key={i}
            className="diamond-grid__cell"
            animate={{ scale: [1, 0.5, 1], opacity: [1, 0.3, 1] }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut",
            }}
          />
        ),
      )}
    </span>
  );
}
