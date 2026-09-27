"use client";

import { DragEvent, useRef, useState } from "react";
import { extractJson } from "@/lib/plan";

const maxBytes = 1024 * 1024;

// ChatGPT hands back a trip-plan.json file; people upload or drop it here. Pasting the JSON is the fallback,
// and the upload button stays available while pasting.
export function JsonFileInput({ value, onChange, fileHint = "trip-plan.json", placeholder }: {
  value: string;
  onChange: (value: string) => void;
  fileHint?: string;
  placeholder?: string;
}) {
  const [pasting, setPasting] = useState(false);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function load(file: File | undefined) {
    if (!file) return;
    setError("");
    if (file.size > maxBytes) return setError("That file is larger than 1 MB. Make sure it's the trip file ChatGPT created.");
    const text = await file.text();
    try {
      extractJson(text);
    } catch {
      return setError(`${file.name} doesn't contain the trip JSON. Ask ChatGPT to create the file again.`);
    }
    setFileName(file.name);
    setPasting(false);
    onChange(text);
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    load(event.dataTransfer.files[0]);
  }

  const picker = (
    <>
      <input ref={input} type="file" accept=".json,application/json,.txt,text/plain" hidden onChange={event => { load(event.target.files?.[0]); event.target.value = ""; }} />
      <button type="button" className="btn" onClick={() => input.current?.click()}>{fileName ? "Replace file" : "Upload file"}</button>
    </>
  );

  if (pasting) {
    return (
      <div className="stack">
        <textarea className="paste-box" value={value} onChange={event => { setFileName(""); onChange(event.target.value); }} placeholder={placeholder} autoFocus />
        <div className="button-row">
          {picker}
          <button type="button" className="btn" onClick={() => setPasting(false)}>Back to file upload</button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="stack">
      <div
        className={`drop-zone ${dragging ? "dragging" : ""} ${value ? "loaded" : ""}`}
        onDragOver={event => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        {value ? (
          <>
            <strong>{fileName ? `${fileName} is ready` : "Your pasted JSON is ready"}</strong>
            <span>Hit Continue to build your trip, or replace it below.</span>
          </>
        ) : (
          <>
            <strong>Drop {fileHint} here</strong>
            <span>or upload the file ChatGPT created for you</span>
          </>
        )}
        <div className="button-row">
          {picker}
          {value && <button type="button" className="btn" onClick={() => { setFileName(""); onChange(""); }}>Clear</button>}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <button type="button" className="link-button" onClick={() => setPasting(true)}>Paste JSON instead</button>
    </div>
  );
}
