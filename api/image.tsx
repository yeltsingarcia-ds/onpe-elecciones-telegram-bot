/** @jsxImportSource react */
import { ImageResponse } from "@vercel/og";

export const config = {
  runtime: "edge",
};

export default async function handler(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const names = (searchParams.get("names") || "").split("|");
    const votes = (searchParams.get("votes") || "")
      .split("|")
      .map(Number);
    const percentages = (searchParams.get("pcts") || "")
      .split("|")
      .map(Number);

    const max = Math.max(...votes);

    return new ImageResponse(
      (
        <div
          style={{
            width: "1200px",
            height: "630px",
            display: "flex",
            flexDirection: "column",
            background: "white",
            padding: "40px",
            fontFamily: "Arial",
          }}
        >
          {/* TÍTULO */}
          <div
            style={{
              fontSize: 32,
              fontWeight: "bold",
              textAlign: "center",
              marginBottom: 30,
            }}
          >
            📊 Elecciones Perú - ONPE
          </div>

          {/* BARRAS */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-around",
              height: "450px",
            }}
          >
            {votes.map((v, i) => {
              const height = (v / max) * 100;

              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    width: "20%",
                  }}
                >
                  {/* BARRA */}
                  <div
                    style={{
                      width: "100%",
                      height: `${height}%`,
                      background: "#165180",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      fontWeight: "bold",
                      textAlign: "center",
                      padding: 8,
                    }}
                  >
                    {new Intl.NumberFormat("en-US").format(v)}
                    <br />
                    {percentages[i]?.toFixed(2)}%
                  </div>

                  {/* NOMBRE */}
                  <div style={{ marginTop: 10, fontSize: 14 }}>
                    {names[i]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (e: any) {
    return new Response(e.message, { status: 500 });
  }
}
