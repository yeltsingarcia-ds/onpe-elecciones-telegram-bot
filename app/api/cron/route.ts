import { put } from "@vercel/blob";

// ================= ENV =================
const BOT_TOKEN = process.env.BOT_TOKEN!;
const CHAT_ID = process.env.CHAT_ID!;
const ONPE_URL = process.env.ONPE_URL!;
const ONPE_SUMMARY_URL = process.env.ONPE_SUMMARY_URL!;
const STATE_PATH = "onpe/latest-state.json";

// ================= HEADERS =================
const ONPE_HEADERS = {
  accept: "*/*",
  "content-type": "application/json",
  referer: "https://resultadoelectoral.onpe.gob.pe/main/presidenciales",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
};

// ================= FETCH =================
async function fetchSnapshot() {
  const res = await fetch(ONPE_URL, {
    headers: ONPE_HEADERS,
    cache: "no-store",
  });

  const text = await res.text();

  if (text.startsWith("<!doctype")) {
    throw new Error("ONPE devolvió HTML");
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

// ================= LOGICA =================
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

function shortName(fullName: string) {
  const parts = fullName.toLowerCase().split(/\s+/);
  return `${capitalize(parts[0])} ${capitalize(parts[parts.length - 2])}`;
}

function capitalize(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function format(n: number) {
  return new Intl.NumberFormat("es-PE").format(n);
}

// ================= MENSAJE =================
function buildMessage(summary: any, top: any[]) {
  return `📊 *Elecciones Perú - ONPE*

🕒 ${new Date(summary.fechaActualizacion).toLocaleString("es-PE")}

🗳 *Actas:* ${summary.actasContabilizadas}%
• Votos: ${format(summary.totalVotosValidos)}
`;
}

// ================= IMAGEN =================
function buildImage(top4: any[]) {
  const labels = top4.map((c) => shortName(c.nombre));
  const votes = top4.map((c) => c.votos);
  const percentages = top4.map((c) => c.porcentaje);

  const chart = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "",
          data: votes,
          backgroundColor: "#165180"
        }
      ]
    },
    options: {
      plugins: {
        legend: { display: false },
        datalabels: {
          display: true,
          color: "#fff",
          formatter: (_: any, ctx: any) => {
            const i = ctx.dataIndex;
            return `${votes[i]}\n${percentages[i].toFixed(2)}%`;
          }
        }
      }
    }
  };

  return `https://quickchart.io/chart?c=${encodeURIComponent(
    JSON.stringify(chart)
  )}&plugins=chartjs-plugin-datalabels`;
}

// ================= TELEGRAM =================
async function sendTelegram(photo: string, caption: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      photo,
      caption,
      parse_mode: "Markdown"
    })
  });
}

// ================= HANDLER =================
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    if (searchParams.get("secret") !== process.env.CRON_SECRET) {
      return new Response("unauthorized", { status: 401 });
    }

    const [snapshot, summary] = await Promise.all([
      fetchSnapshot(),
      fetchSummary()
    ]);

    const top = extractTop(snapshot);

    const imageUrl = buildImage(top);
    const message = buildMessage(summary, top);

    await sendTelegram(imageUrl, message);

    return new Response("ok");
  } catch (e: any) {
    console.error(e);
    return new Response(e.message, { status: 500 });
  }
}
