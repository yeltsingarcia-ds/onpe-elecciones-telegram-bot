import { ImageResponse } from "next/og";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const names = (url.searchParams.get("names") || "").split("|");
    const votes = (url.searchParams.get("votes") || "").split("|").map(Number);

    return new ImageResponse(
      (
        <div
          style={{
            width: "1200px",
            height: "630px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            background: "#f5f5f5",
            padding: "40px",
            fontSize: 32,
          }}
        >
          {names.map((name, i) => {
            const max = Math.max(...votes);
            const width = (votes[i] / max) * 800;

            return (
              <div key={i} style={{ marginBottom: 40 }}>
                <div>{name}</div>

                <div
                  style={{
                    height: 40,
                    width: width,
                    background: "#2d70b3",
                    borderRadius: 10,
                    marginTop: 10,
                  }}
                />

                <div style={{ fontSize: 24 }}>
                  {votes[i].toLocaleString("es-PE")}
                </div>
              </div>
            );
          })}
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
