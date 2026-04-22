import { put } from "@vercel/blob";

export default async function handler(req: any, res: any) {
  try {
    const secret = req.query?.secret;

    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const [snapshot, summary] = await Promise.all([
      fetchSnapshot(),
      fetchSummary(),
    ]);

// ================= ENV =================
const BOT_TOKEN = process.env.BOT_TOKEN!;
const CHAT_ID = process.env.CHAT_ID!;

const ONPE_URL = process.env.ONPE_URL!;
const ONPE_SUMMARY_URL = process.env.ONPE_SUMMARY_URL!;

const STATE_PATH = "onpe/latest-state.json";

// ================= HEADERS ONPE =================
const ONPE_HEADERS = {
  accept: "*/*",
  "content-type": "application/json",
  referer: "https://resultadoelectoral.onpe.gob.pe/main/presidenciales",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
};

// ================= FETCH =================
async function fetchSnapshot() {
  const res = await fetch(ONPE_URL, {
    headers: ONPE_HEADERS,
    cache: "no-store",
  });

  if (!res.ok) throw new Error("Snapshot error");

  return res.text();
}

async function fetchSummary() {
  const res = await fetch(ONPE_SUMMARY_URL, {
    headers: ONPE_HEADERS,
    cache: "no-store",
  });

  if (!res.ok) throw new Error("Summary error");

  const json = await res.json();
  return json.data ?? json;
}

// ================= TOP 3 =================
function extractTop3(snapshotText: string) {
  const parsed = JSON.parse(snapshotText);

  const candidatos =
    parsed?.data?.resultados ??
    parsed?.data ??
    parsed?.resultados ??
    [];

  if (!Array.isArray(candidatos)) {
    console.log("DEBUG ONPE:", JSON.stringify(parsed, null, 2));
    throw new Error("Formato inesperado de ONPE");
  }

  return candidatos
    .map((c: any) => ({
      nombre:
        c.nombre ??
        c.nombreCompleto ??
        c.organizacionPolitica ??
        "N/A",
      votos: Number(c.votos ?? c.totalVotos ?? c.voto ?? 0),
      porcentaje: Number(c.porcentaje ?? c.porcentajeVotos ?? 0),
    }))
    .sort((a: any, b: any) => b.votos - a.votos)
    .slice(0, 3);
}
    
// ================= UTILS =================
function calcDiff(a: any, b: any) {
  return {
    votos: a.votos - b.votos,
    porcentaje: (a.porcentaje - b.porcentaje).toFixed(2),
  };
}

function format(n: number) {
  return new Intl.NumberFormat("es-PE").format(n);
}

// ================= MENSAJE =================
function buildMessage(summary: any, top3: any[]) {
  const d12 = calcDiff(top3[0], top3[1]);
  const d23 = calcDiff(top3[1], top3[2]);

  return `
📊 *Elecciones Perú - ONPE*

🕒 Actualizado al ${new Date(summary.fechaActualizacion).toLocaleString("es-PE")}

🗳 *Estado del conteo*
• Actas contabilizadas: ${summary.actasContabilizadas} %
• Total votos válidos: ${format(summary.totalVotosValidos)}

📉 *Diferencias*
• 1 vs 2: +${format(d12.votos)} votos (${d12.porcentaje}%)
• 2 vs 3: +${format(d23.votos)} votos (${d23.porcentaje}%)
`;
}

// ================= TELEGRAM =================
async function sendTelegram(photo: string, caption: string) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      photo,
      caption,
      parse_mode: "Markdown",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telegram error: ${text}`);
  }
}

// ================= IMAGEN =================
// TEMPORAL (luego conectamos tu render real)
function buildImage(top3: any[]) {
  return `https://placehold.co/1200x630/png?text=${encodeURIComponent(
    `${top3[0].nombre} vs ${top3[1].nombre} vs ${top3[2].nombre}`
  )}`;
}

// ================= STATE =================
async function getPrevState() {
  try {
    const res = await fetch(process.env.STATE_URL!, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function saveState(state: any) {
  const blob = await put(STATE_PATH, JSON.stringify(state), {
    access: "public",
    allowOverwrite: true,
    addRandomSuffix: false,
  });

  return blob.url;
}

function hasChanges(prev: any, next: any) {
  if (!prev) return true;

  for (let i = 0; i < 3; i++) {
    if (prev.top3[i].votos !== next.top3[i].votos) {
      return true;
    }
  }

  return false;
}

// ================= HANDLER =================
export default async function handler(req: any, res: any) {
  try {
    const [snapshot, summary] = await Promise.all([
      fetchSnapshot(),
      fetchSummary(),
    ]);

    const top3 = extractTop3(snapshot);

    const nextState = {
      updatedAt: summary.fechaActualizacion,
      top3,
    };

    const prevState = await getPrevState();

    if (!hasChanges(prevState, nextState)) {
      return res.status(200).json({ ok: true, sent: false });
    }

    const imageUrl = buildImage(top3);
    const message = buildMessage(summary, top3);

    await sendTelegram(imageUrl, message);

    const stateUrl = await saveState(nextState);

    return res.status(200).json({
      ok: true,
      sent: true,
      imageUrl,
      stateUrl,
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
