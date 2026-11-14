import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/virtual-tour-plugin/index.css";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createTour, parseTour, TourEditor, TourViewer, type PanoramaSource, type Tour } from "../src";
import "./demo.css";
import { samplePanoramas, sampleTour } from "./sample";
import { addUploads, clearUploads, loadUploads } from "./uploads";

const STORAGE_KEY = "pano-grid-tour-demo:tour";
const LANGUAGES = ["en", "ru"];

function loadTour(): Tour {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return (saved && parseTour(JSON.parse(saved))) || sampleTour;
  } catch {
    return sampleTour;
  }
}

function App() {
  const [tour, setTour] = useState<Tour>(loadTour);
  const [samples, setSamples] = useState<PanoramaSource[]>([]);
  const [uploads, setUploads] = useState<PanoramaSource[]>([]);
  const [view, setView] = useState<"editor" | "viewer">("editor");
  const [lang, setLang] = useState("en");
  const [json, setJson] = useState("");
  const [jsonError, setJsonError] = useState(false);

  useEffect(() => {
    void samplePanoramas().then(setSamples);
    void loadUploads().then(setUploads);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tour));
    } catch {
      // storage blocked: the tour lives for this page only
    }
  }, [tour]);

  const panoramas = useMemo(() => [...uploads, ...samples], [uploads, samples]);
  const languages = useMemo(() => [lang, ...LANGUAGES.filter((l) => l !== lang)], [lang]);

  return (
    <main className="demo pgt-theme">
      <header className="demo-header">
        <h1>pano-grid-tour</h1>
        <p>
          Draw rooms on the grid, put a 360° photo in each, link them, then try the tour. Photos you add stay in this
          browser only. <a href="https://github.com/DeMoZ/pano-grid-tour">Source on GitHub</a>
        </p>
        <div className="demo-actions">
          <div className="pgt-segmented">
            <button
              type="button"
              className="pgt-button"
              aria-pressed={view === "editor"}
              onClick={() => setView("editor")}
            >
              Editor
            </button>
            <button
              type="button"
              className="pgt-button"
              aria-pressed={view === "viewer"}
              onClick={() => setView("viewer")}
            >
              Viewer
            </button>
          </div>
          <label className="pgt-button demo-file">
            Add 360° photos
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                  void addUploads(files).then((added) => setUploads((list) => [...list, ...added]));
                }
                e.target.value = "";
              }}
            />
          </label>
          <label className="demo-lang">
            Language
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="pgt-button" onClick={() => setTour(sampleTour)}>
            Load sample flat
          </button>
          <button type="button" className="pgt-button" onClick={() => setTour(createTour())}>
            Empty tour
          </button>
          {uploads.length > 0 && (
            <button type="button" className="pgt-button" onClick={() => void clearUploads().then(() => setUploads([]))}>
              Remove my photos
            </button>
          )}
        </div>
      </header>

      {view === "editor" ? (
        <TourEditor value={tour} onChange={setTour} panoramas={panoramas} languages={languages} />
      ) : (
        <div className="demo-viewer">
          <TourViewer tour={tour} panoramas={panoramas} lang={lang} />
        </div>
      )}

      <details
        className="demo-json"
        onToggle={(e) => (e.currentTarget.open ? setJson(JSON.stringify(tour, null, 2)) : null)}
      >
        <summary>Tour JSON</summary>
        <textarea
          value={json}
          spellCheck={false}
          onChange={(e) => {
            setJson(e.target.value);
            setJsonError(false);
          }}
          rows={16}
        />
        <div className="pgt-row">
          <button
            type="button"
            className="pgt-button"
            onClick={() => {
              try {
                const parsed = parseTour(JSON.parse(json));
                if (parsed) {
                  setTour(parsed);
                } else {
                  setJsonError(true);
                }
              } catch {
                setJsonError(true);
              }
            }}
          >
            Load this JSON
          </button>
          <button type="button" className="pgt-button" onClick={() => setJson(JSON.stringify(tour, null, 2))}>
            Refresh
          </button>
          {jsonError && <span className="demo-error">Not a tour.</span>}
        </div>
      </details>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
