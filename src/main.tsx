import { StrictMode, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

class ApplicationBootstrap {
  public constructor(private readonly rootElement: HTMLElement) {}

  public mount(): Root {
    const root = createRoot(this.rootElement);
    root.render(this.createApplication());
    return root;
  }

  private createApplication(): ReactElement {
    return (
      <StrictMode>
        <App />
      </StrictMode>
    );
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Squarecast root element is missing.");
new ApplicationBootstrap(rootElement).mount();
