import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import "./calendar-composer.css";

/** A compact date/time summary; the existing scheduling controls stay inside. */
export function CalendarScheduleDisclosure({
  date,
  detail,
  children,
}: {
  date: string;
  detail: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const reduced = useReducedMotion();
  return (
    <section className="calendar-schedule" data-expanded={open}>
      <button
        type="button"
        className="calendar-schedule-summary"
        aria-label="日期与时间"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span>
          <strong>{date.replaceAll("-", "/")}</strong>
          <span>{detail}</span>
        </span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            className="calendar-schedule-expansion"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={
              reduced
                ? { duration: 0 }
                : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
            }
          >
            <div className="calendar-schedule-fields">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
