// @ts-nocheck
/**
 * transfr is a fully static app: all reference data is served from
 * /data/*.json and the requirement/cost engine runs in the browser (see
 * client/src/api/client.ts). No backend is required.
 *
 * This tiny health endpoint is dependency-free so it can never fail the
 * deployment. You can safely delete the whole /api folder if you prefer.
 */
export default function handler(_req: any, res: any) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      ok: true,
      note: "transfr is a static app; reference data is served from /data/*.json",
    })
  );
}
