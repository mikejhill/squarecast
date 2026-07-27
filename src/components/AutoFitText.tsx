import { useLayoutEffect, useRef } from "react";
import { applicationServices } from "../app/application-services";
import { RenderedTextFitter } from "../services/rendered-text-fitter";

type AutoFitTextProps = {
  text: string;
  mode: "auto" | "fixed";
  fixedSize: number;
};

/** Connects rendered text measurement to font readiness and tile resizes. */
export function AutoFitText({
  text,
  mode,
  fixedSize,
}: AutoFitTextProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (mode === "fixed") {
      element.style.fontSize = `${fixedSize}px`;
      return;
    }
    const container = element.parentElement;
    if (!container) return;

    const fitter = new RenderedTextFitter(
      element,
      container,
      applicationServices.fontSizeOptimizer,
      applicationServices.autoFontSizePolicy,
    );
    let active = true;
    let frame = 0;
    const fit = () => {
      if (active) fitter.fit();
    };
    const scheduleFit = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(fit);
    };

    fit();
    const observer = new ResizeObserver(scheduleFit);
    observer.observe(container);
    void document.fonts.ready.then(scheduleFit);

    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fixedSize, mode, text]);

  return (
    <span className="auto-fit-slot">
      <span ref={ref} className="auto-fit">
        {text}
      </span>
    </span>
  );
}
