"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { notify } from "./toast";

// "ABC WhatsApp" in the account menu: the group's invite link, a QR code for it, and a copy button. The link
// itself comes from the server (WHATSAPP_GROUP_URL) so it is only handed to signed-in attendees and never
// sits in this public repository.
export function WhatsAppModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { width: 260, margin: 1, errorCorrectionLevel: "M" }).then(setQr).catch(() => setQr(""));
  }, [url]);
  async function copy() {
    try { await navigator.clipboard.writeText(url); notify.success("Link copied"); } catch { notify.error(null, "Couldn't copy. Long-press or select the link instead."); }
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal confirm-modal whatsapp" onClick={event => event.stopPropagation()}>
        <button className="modal-x" onClick={onClose}>×</button>
        <p className="eyebrow">Group chat</p>
        <h2>ABC WhatsApp</h2>
        {url ? (
          <>
            <p className="muted">Tap the button to open the group in WhatsApp. To add someone standing next to you, let them scan the code with their phone camera.</p>
            {qr && <img className="qr" src={qr} alt="QR code for the ABC WhatsApp group link" width={260} height={260} />}
            <a className="btn primary" href={url} target="_blank" rel="noopener noreferrer">Open the WhatsApp group</a>
            <div className="button-row"><button type="button" className="btn" onClick={copy}>Copy link</button><span className="muted link-text">{url}</span></div>
          </>
        ) : (
          <p className="muted">The group link isn&apos;t set up yet. The organizer adds it as WHATSAPP_GROUP_URL in the app&apos;s Vercel settings.</p>
        )}
      </section>
    </div>
  );
}
