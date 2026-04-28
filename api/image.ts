import { createCanvas } from "canvas";

export default async function handler(req: any, res: any) {
  try {
    const { names, votes, percentages } = req.query;

    const namesArr = names.split("|");
    const votesArr = votes.split("|").map(Number);
    const percArr = percentages.split("|").map(Number);

    const width = 1200;
    const height = 630;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // fondo blanco
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    const max = Math.max(...votesArr);

    const barWidth = 180;
    const gap = 60;
    const startX = 100;
    const baseY = 520;

    ctx.textAlign = "center";

    namesArr.forEach((fullName: string, i: number) => {
      const parts = fullName.split(" ");
      const shortName =
        parts.length >= 2
          ? `${capitalize(parts[0])} ${capitalize(parts[parts.length - 1])}`
          : capitalize(parts[0]);

      const value = votesArr[i];
      const pct = percArr[i];

      const barHeight = (value / max) * 350;

      const x = startX + i * (barWidth + gap);
      const y = baseY - barHeight;

      // barra
      ctx.fillStyle = "#165180";
      ctx.fillRect(x, y, barWidth, barHeight);

      // texto dentro barra
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 24px Arial";

      ctx.fillText(shortName, x + barWidth / 2, y + 40);

      ctx.font = "20px Arial";
      ctx.fillText(formatVotes(value), x + barWidth / 2, y + 80);
      ctx.fillText(`${pct.toFixed(2)}%`, x + barWidth / 2, y + 110);
    });

    res.setHeader("Content-Type", "image/png");
    res.send(canvas.toBuffer());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

function formatVotes(n: number) {
  return new Intl.NumberFormat("es-PE").format(n).replace(/,/g, "'");
}

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
