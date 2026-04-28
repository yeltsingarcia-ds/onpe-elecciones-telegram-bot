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

// ================= TOP =================
function extractTop(snapshotText: string) {
  const parsed = JSON.parse(snapshotText);

  const candidatos = parsed?.data ?? [];

  if (!Array.isArray(candidatos)) {
    console.log("DEBUG ONPE:", JSON.stringify(parsed, null, 2));
    throw new Error("Formato inesperado de ONPE");
  }

  const mapped = candidatos.map((c: any) => {
    const nombre = c.nombreCandidato?.trim() || "N/A";

    return {
      nombre,
      votos: Number(c.totalVotosValidos ?? 0),
      porcentaje: Number(c.porcentajeVotosValidos ?? 0),
    };
  });

  return mapped
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

  const nombre = parts[0];
  const apellido = parts[parts.length - 2];

  return `${capitalize(nombre)} ${capitalize(apellido)}`;
}

function capitalize(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// ================= MENSAJE =================
function buildMessage(summary: any, top: any[]) {
  if (top.length < 4) {
    return `📊 *Elecciones Perú - ONPE*\n\n⚠️ Sin datos suficientes`;
  }

  const d12 = calcDiff(top[0], top[1]);
  const d23 = calcDiff(top[1], top[2]);
  const d34 = calcDiff(top[2], top[3]);

  return `
📊 *Elecciones Perú - ONPE*

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

  if (parts.length === 3) {
    return `${parts[0]}'${parts[1]},${parts[2]}`;
  }

  return n.toString();
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
          data: votes,
          backgroundColor: "#165180",
          borderRadius: 6
        }
      ]
    },
    options: {
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: "📊 Elecciones Perú - ONPE",
          color: "#000",
          font: { size: 18 }
        },
        datalabels: {
          anchor: "center",
          align: "center",
          color: "#ffffff",
          font: { weight: "bold", size: 11 },
          formatter: (_: any, ctx: any) => {
            const i = ctx.dataIndex;
            return `${formatVotesONPE(votes[i])}\n${percentages[i].toFixed(3)}%`;
          }
        }
      }
    },
    plugins: ["chartjs-plugin-datalabels"]
  };

  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}`;
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
    const secret = req.query?.secret;

    if (secret !== process.env.CRON_SECRET) {
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

    await sendTelegram(imageUrl, message);
    const stateUrl = await saveState(nextState);

    return res.json({ ok: true, sent: true, imageUrl, stateUrl });

  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
