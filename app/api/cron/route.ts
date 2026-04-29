import { put } from "@vercel/blob";

// ================= ENV =================
const BOT_TOKEN = process.env.BOT_TOKEN!;
const CHAT_ID = process.env.CHAT_ID!;
// const ONPE_URL = process.env.ONPE_URL!;
// const ONPE_SUMMARY_URL = process.env.ONPE_SUMMARY_URL!;
const STATE_PATH = "onpe/latest-state.json";

// ================= HEADERS =================
const ONPE_HEADERS = {
  accept: "*/*",
  "accept-language": "es-PE,es;q=0.9",
  "content-type": "application/json",
  referer: "https://resultadoelectoral.onpe.gob.pe/main/presidenciales",
  origin: "https://resultadoelectoral.onpe.gob.pe",
  "sec-ch-ua": '"Chromium";v="122", "Not(A:Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

// ================= FETCH =================
async function fetchSnapshot() {
  return `{
    "data": [
      {
        "nombreCandidato": "KEIKO SOFIA FUJIMORI HIGUCHI",
        "totalVotosValidos": 2764951,
        "porcentajeVotosValidos": 17.075
      },
      {
        "nombreCandidato": "ROBERTO HELBERT SANCHEZ PALOMINO",
        "totalVotosValidos": 1949738,
        "porcentajeVotosValidos": 12.041
      },
      {
        "nombreCandidato": "RAFAEL BERNARDO LOPEZ ALIAGA",
        "totalVotosValidos": 1925323,
        "porcentajeVotosValidos": 11.890
      },
      {
        "nombreCandidato": "JORGE NIETO MONTESINOS",
        "totalVotosValidos": 1782969,
        "porcentajeVotosValidos": 11.010
      }
    ]
  }`;
}

async function fetchSummary() {
  return {
    fechaActualizacion: Date.now(),
    actasContabilizadas: 95.321,
    totalVotosValidos: 16234567
  };
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
