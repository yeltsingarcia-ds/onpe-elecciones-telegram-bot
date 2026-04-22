import { put } from "@vercel/blob";

const BOT_TOKEN = process.env.BOT_TOKEN!;
const CHAT_ID = process.env.CHAT_ID!;

// 👉 Cambia por endpoints reales
const ONPE_URL = process.env.ONPE_URL!;
const ONPE_SUMMARY_URL = process.env.ONPE_SUMMARY_URL!;

const STATE_PATH = "onpe/latest-state.json";

async function fetchJSON(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Error ONPE");
  return res.json();
}

// ⚠️ AJUSTAR SEGÚN JSON REAL
function extractTop3(snapshot: any) {
  const rows = snapshot.resultados || [];

  return rows
    .map((r: any) => ({
      nombre: r.nombre,
      votos: Number(r.votos),
      porcentaje: Number(r.porcentaje),
    }))
    .sort((a: any, b: any) => b.votos - a.votos)
    .slice(0, 3);
}

function calcDiff(a: any, b: any) {
  return {
    votos: a.votos - b.votos,
    porcentaje: (a.porcentaje - b.porcentaje).toFixed(2),
  };
}

function format(n: number) {
  return new Intl.NumberFormat("es-PE").format(n);
}

function buildMessage(summary: any, top3: any[]) {
  const d12 = calcDiff(top3[0], top3[1]);
  const d23 = calcDiff(top3[1], top3[2]);

  return `
📊 *Elecciones Perú - ONPE*

🕒 Actualizado al ${summary.fechaActualizacion}

🗳 *Estado del conteo*
• Actas contabilizadas: ${summary.actasContabilizadas} %
• Total de actas: ${format(summary.totalActas)}
• Contabilizadas: ${format(summary.contabilizadas)}
• Para envío al JEE: ${format(summary.paraEnvioJEE)}
• Pendientes: ${format(summary.pendientes)}

📉 *Diferencias*
• 1 vs 2: +${format(d12.votos)} votos (${d12.porcentaje}%)
• 2 vs 3: +${format(d23.votos)} votos (${d23.porcentaje}%)
`;
}

async function sendTelegram(photo: string, caption: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      photo,
      caption,
      parse_mode: "Markdown",
    }),
  });
}

// 👉 Dummy imagen (luego reemplazamos por tu render real)
function buildDummyImage(top3: any[]) {
  return `https://placehold.co/1200x630/png?text=${encodeURIComponent(
    `${top3[0].nombre} vs ${top3[1].nombre} vs ${top3[2].nombre}`
  )}`;
}

export default async function handler(req: any, res: any) {
  try {
    const [snapshot, summary] = await Promise.all([
      fetchJSON(ONPE_URL),
      fetchJSON(ONPE_SUMMARY_URL),
    ]);

    const top3 = extractTop3(snapshot);

    const state = {
      updatedAt: summary.fechaActualizacion,
      top3,
    };

    // 👉 leer estado previo
    let prev = null;
    try {
      const r = await fetch(process.env.STATE_URL!);
      prev = await r.json();
    } catch {}

    let changed = false;

    if (!prev) changed = true;
    else {
      for (let i = 0; i < 3; i++) {
        if (prev.top3[i].votos !== state.top3[i].votos) {
          changed = true;
        }
      }
    }

    if (!changed) {
      return res.status(200).json({ ok: true, sent: false });
    }

    const imageUrl = buildDummyImage(top3);
    const message = buildMessage(summary, top3);

    await sendTelegram(imageUrl, message);

    const blob = await put(STATE_PATH, JSON.stringify(state), {
      access: "public",
      allowOverwrite: true,
    });

    return res.status(200).json({
      ok: true,
      sent: true,
      stateUrl: blob.url,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
