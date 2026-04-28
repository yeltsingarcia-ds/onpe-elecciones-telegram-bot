import { put } from "@vercel/blob";

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
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
};

// ================= FETCH =================
async function fetchSnapshot() {
  const res = await fetch(ONPE_URL, {
    headers: ONPE_HEADERS,
    cache: "no-store",
  });

  const text = await res.text();

  if (text.startsWith("<!doctype")) {
    throw new Error("ONPE devolvió HTML (bloqueo)");
  }

  return text;
}

async function fetchSummary() {
  const res = await fetch(ONPE_SUMMARY_URL, {
    headers: ONPE_HEADERS,
    cache: "no-store",
  });

  const text = await res.text();

  if (text.startsWith("<!doctype")) {
    throw new Error("ONPE summary devolvió HTML");
  }

  const json = JSON.parse(text);
  return json.data ?? json;
}

// ================= TOP =================
function extractTop(snapshotText: string) {
  const parsed = JSON.parse(snapshotText);
  const candidatos = parsed?.data ?? [];

  return candidatos
    .map((c: any) => ({
      nombre: c.nombreCandidato?.trim() || "N/A",
      votos: Number(c.totalVotosValidos ?? 0),
      porcentaje: Number(c.porcentajeVotosValidos ?? 0),
    }))
    .filter((c) => c.nombre !== "N/A" && c.votos > 0)
    .sort((a, b) => b.votos - a.votos)
    .slice(0, 4);
}

// ================= UTILS =================
function calcDiff(a: any, b: any) {
  return {
    votos: a.votos - b.votos,
    porcentaje: Number((a.porcentaje - b.porcentaje).toFixed(2)),
  };
}

function format(n: number) {
  return new Intl.NumberFormat("es-PE").format(n);
}

// ================= NAME =================
function shortName(fullName: string) {
  const parts = fullName.toLowerCase().split(/\s+/);
  return `${capitalize(parts[0])} ${capitalize(parts[parts.length - 2])}`;
}

function capitalize(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// ================= MENSAJE =================
function buildMessage(summary: any, top: any[]) {
  const d12 = calcDiff(top[0], top[1]);
  const d23 = calcDiff(top[1], top[2]);
  const d34 = calcDiff(top[2], top[3]);

  return `📊 *Elecciones Perú - ONPE*

🕒 Actualizado al ${new Date(summary.fechaActualizacion).toLocaleString("es-PE")}

🗳 *Estado del conteo*
• Actas contabilizadas: ${summary.actasContabilizadas} %
• Total votos válidos: ${format(summary.totalVotosValidos)}

📉 *Diferencias*

• ${shortName(top[0].nombre)} vs ${shortName(top[1].nombre)}:
+${format(d12.votos)} votos (${d12.porcentaje}%)

• ${shortName(top[1].nombre)} vs ${shortName(top[2].nombre)}:
+${format(d23.votos)} votos (${d23.porcentaje}%)

• ${shortName(top[2].nombre)} vs ${shortName(top[3].nombre)}:
+${format(d34.votos)} votos (${d34.porcentaje}%)
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

// ================= FORMAT ONPE =================
function formatVotesONPE(n: number) {
  const parts = new Intl.NumberFormat("en-US").format(n).split(",");
  return parts.length === 3
    ? `${parts[0]}'${parts[1]},${parts[2]}`
    : n.toString();
}

// ================= IMAGEN =================
function buildImage(top4: any[]) {
  const labels = top4.map((c) => shortName(c.nombre));
  const votes = top4.map((c) => c.votos);
  const percentages = top4.map((c) => c.porcentaje);

  const chartConfig = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: " ", // elimina "undefined"
          data: votes,
          backgroundColor: "#165180",
        }
      ]
    },
    options: {
      layout: {
        padding: { top: 30 }
      },
      plugins: {
        legend: {
          display: false
        },
        datalabels: {
          display: true,
          color: "#ffffff",
          anchor: "center",
          align: "center",
          clamp: true,
          clip: false,
          font: {
            weight: "bold",
            size: 11
          },
          formatter: (_: any, ctx: any) => {
            const i = ctx.dataIndex;
            return `${formatVotesONPE(votes[i])} (${percentages[i].toFixed(2)}%)`;
          }
        }
      }
    }
  };

  return `https://quickchart.io/chart?c=${encodeURIComponent(
    JSON.stringify(chartConfig)
  )}&plugins=chartjs-plugin-datalabels`;
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
    addRandomSuffix: false,
  });

  return blob.url;
}

function hasChanges(prev: any, next: any) {
  if (!prev) return true;
  return prev.top3.some((p: any, i: number) => p.votos !== next.top3[i].votos);
}

// ================= HANDLER =================
export default async function handler(req: any, res: any) {
  try {
    if (req.query?.secret !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const [snapshot, summary] = await Promise.all([
      fetchSnapshot(),
      fetchSummary(),
    ]);

    const top = extractTop(snapshot);

    const nextState = {
      updatedAt: summary.fechaActualizacion,
      top3: top.slice(0, 3),
    };

    const prevState = await getPrevState();

    if (!hasChanges(prevState, nextState)) {
      return res.json({ ok: true, sent: false });
    }

    const imageUrl = buildImage(top);
    const message = buildMessage(summary, top);

    // ✅ UN SOLO MENSAJE (imagen + texto)
    await sendTelegram(imageUrl, message);

    await saveState(nextState);

    return res.json({ ok: true, sent: true });

  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
