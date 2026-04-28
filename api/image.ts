import { ImageResponse } from "@vercel/og";

export const config = {
  runtime: "edge",
};

export default async function handler(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const names = (searchParams.get("names") || "").split("|");
    const votes = (searchParams.get("votes") || "").split("|").map(Number);

    const max = Math.max(...votes, 1);

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
                  {votes[i]?.toLocaleString("es-PE")}
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
